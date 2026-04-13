from __future__ import annotations

import fnmatch
import hashlib
import json
import os
import posixpath
import re
import shutil
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from copy import deepcopy
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


TEXT_EXTENSIONS = {
    ".c",
    ".cc",
    ".cpp",
    ".css",
    ".csv",
    ".go",
    ".html",
    ".java",
    ".js",
    ".json",
    ".jsx",
    ".md",
    ".mjs",
    ".pdf",
    ".py",
    ".rb",
    ".rs",
    ".sh",
    ".sql",
    ".toml",
    ".ts",
    ".tsx",
    ".txt",
    ".yaml",
    ".yml",
}

DEFAULT_EXCLUDES = [
    ".DS_Store",
    ".git/**",
    ".idea/**",
    ".next/**",
    ".pytest_cache/**",
    ".ruff_cache/**",
    ".venv/**",
    ".vscode/**",
    "__pycache__/**",
    "build/**",
    "coverage/**",
    "dist/**",
    "node_modules/**",
    "*.pyc",
    "*.pyo",
    "*.tsbuildinfo",
]

MARKDOWN_WIKI_RE = re.compile(r"\[\[([^\]]+)\]\]")
MARKDOWN_LINK_RE = re.compile(r"\[[^\]]+\]\(([^)]+)\)")


@dataclass
class FileRecord:
    source_name: str
    category: str
    rel_path: str
    original_path: str
    mirrored_rel_path: str
    size_bytes: int
    extension: str
    is_text: bool
    summary: str
    content_hash: str


@dataclass
class SkippedRecord:
    source_name: str
    rel_path: str
    reason: str


@dataclass
class FileCandidate:
    source_name: str
    category: str
    rel_path: str
    original_path: str
    mirrored_rel_path: str
    size_bytes: int


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def slugify(value: str) -> str:
    lowered = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return lowered or "source"


def normalize_pattern(pattern: str) -> str:
    normalized = pattern.replace("\\", "/").lstrip("./")
    return normalized or pattern


def resolve_path_value(value: str, *, base_dir: Path) -> str:
    expanded = Path(value).expanduser()
    if expanded.is_absolute():
        return str(expanded)
    return str((base_dir / expanded).resolve())


def resolve_config_paths(config: dict, *, base_dir: Path) -> dict:
    normalized = deepcopy(config)
    normalized["output_dir"] = resolve_path_value(normalized["output_dir"], base_dir=base_dir)
    for source in normalized.get("sources", []):
        source["path"] = resolve_path_value(source["path"], base_dir=base_dir)
    access = normalized.setdefault("access", {})
    access.setdefault("allowed_roots", [])
    access.setdefault("blocked_paths", [])
    access.setdefault("blocked_patterns", [])
    access.setdefault("enforce_copy_mode", True)
    access["allowed_roots"] = [
        resolve_path_value(value, base_dir=base_dir) for value in access.get("allowed_roots", [])
    ]
    access["blocked_paths"] = [
        resolve_path_value(value, base_dir=base_dir) for value in access.get("blocked_paths", [])
    ]
    return normalized


def path_is_within(path: Path, candidate_root: Path) -> bool:
    try:
        path.relative_to(candidate_root)
        return True
    except ValueError:
        return False


def evaluate_path_access(path: Path, access: dict) -> tuple[bool, str]:
    resolved_path = path.expanduser().resolve()
    blocked_paths = [Path(item).expanduser().resolve() for item in access.get("blocked_paths", [])]
    allowed_roots = [Path(item).expanduser().resolve() for item in access.get("allowed_roots", [])]

    for blocked in blocked_paths:
        if path_is_within(resolved_path, blocked):
            return False, f"Blocked by access path: {blocked}"

    if allowed_roots and not any(path_is_within(resolved_path, root) for root in allowed_roots):
        return False, "Outside allowed roots"

    return True, ""


def evaluate_relative_access(rel_path: str, name: str, access: dict) -> tuple[bool, str]:
    blocked_patterns = access.get("blocked_patterns", [])
    if blocked_patterns and matches_any(rel_path, name, blocked_patterns, mode="exclude"):
        return False, f"Blocked by pattern: {rel_path}"
    return True, ""


def matches_any(
    rel_posix: str,
    name: str,
    patterns: Iterable[str],
    *,
    mode: str,
) -> bool:
    for raw_pattern in patterns:
        pattern = normalize_pattern(raw_pattern)
        has_separator = "/" in pattern
        has_glob = any(char in pattern for char in "*?[")

        if mode == "include":
            if has_separator:
                if fnmatch.fnmatch(rel_posix, pattern):
                    return True
                if pattern.startswith("**/") and fnmatch.fnmatch(rel_posix, pattern[3:]):
                    return True
            elif has_glob:
                if "/" not in rel_posix and fnmatch.fnmatch(rel_posix, pattern):
                    return True
            elif rel_posix == pattern:
                return True
            continue

        if has_separator:
            if fnmatch.fnmatch(rel_posix, pattern):
                return True
            if pattern.endswith("/**"):
                prefix = pattern[:-3].rstrip("/")
                if rel_posix == prefix or rel_posix.startswith(f"{prefix}/"):
                    return True
        if pattern.startswith("**/") and fnmatch.fnmatch(rel_posix, pattern[3:]):
            return True
        if not has_separator and has_glob and fnmatch.fnmatch(name, pattern):
            return True
        if not has_separator and not has_glob and (rel_posix == pattern or name == pattern):
            return True
    return False


def is_probably_text(path: Path) -> bool:
    return path.suffix.lower() in TEXT_EXTENSIONS


def read_text_safe(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 64), b""):
            digest.update(chunk)
    return digest.hexdigest()


def extract_summary(path: Path) -> str:
    if path.suffix.lower() == ".pdf":
        return "PDF artifact"
    if not is_probably_text(path):
        return ""
    text = read_text_safe(path)
    if not text:
        return ""
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("#"):
            return stripped.lstrip("#").strip()[:160]
        return stripped[:160]
    return ""


def ensure_clean_dir(path: Path, clean: bool) -> None:
    if clean and path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def resolve_markdown_target(
    raw_target: str,
    current_rel: Path,
    rel_lookup: dict[str, FileRecord],
    stem_lookup: dict[str, list[FileRecord]],
) -> str | None:
    target = raw_target.strip()
    if not target or target.startswith("#"):
        return None
    if "://" in target or target.startswith("mailto:"):
        return None

    target = target.split("#", 1)[0].strip()
    target = target.split("|", 1)[0].strip()
    if not target:
        return None

    if target.startswith("/"):
        candidate = posixpath.normpath(target.lstrip("/"))
    else:
        candidate = posixpath.normpath((Path(current_rel.parent) / target).as_posix())

    direct_candidates = [candidate]
    if "." not in Path(candidate).name:
        direct_candidates.append(f"{candidate}.md")

    for maybe in direct_candidates:
        if maybe in rel_lookup:
            return maybe

    stem = Path(target).stem.lower()
    matches = stem_lookup.get(stem, [])
    if len(matches) == 1:
        return matches[0].rel_path
    return None


def extract_edges(
    record: FileRecord,
    source_files: list[FileRecord],
) -> list[dict[str, str]]:
    if not record.is_text or record.extension != ".md":
        return []

    path = Path(record.original_path)
    text = read_text_safe(path)
    if not text:
        return []

    rel_lookup = {item.rel_path: item for item in source_files}
    stem_lookup: dict[str, list[FileRecord]] = {}
    for item in source_files:
        stem_lookup.setdefault(Path(item.rel_path).stem.lower(), []).append(item)

    current_rel = Path(record.rel_path)
    edges: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()

    for match in MARKDOWN_WIKI_RE.finditer(text):
        resolved = resolve_markdown_target(match.group(1), current_rel, rel_lookup, stem_lookup)
        if resolved:
            pair = (record.rel_path, resolved)
            if pair not in seen:
                seen.add(pair)
                edges.append(
                    {
                        "type": "links_to",
                        "from": f"file:{record.source_name}:{record.rel_path}",
                        "to": f"file:{record.source_name}:{resolved}",
                    }
                )

    for match in MARKDOWN_LINK_RE.finditer(text):
        resolved = resolve_markdown_target(match.group(1), current_rel, rel_lookup, stem_lookup)
        if resolved:
            pair = (record.rel_path, resolved)
            if pair not in seen:
                seen.add(pair)
                edges.append(
                    {
                        "type": "links_to",
                        "from": f"file:{record.source_name}:{record.rel_path}",
                        "to": f"file:{record.source_name}:{resolved}",
                    }
                )

    return edges


def copy_or_link(source_file: Path, dest_file: Path, mode: str) -> None:
    dest_file.parent.mkdir(parents=True, exist_ok=True)
    if mode == "symlink":
        if dest_file.exists() or dest_file.is_symlink():
            dest_file.unlink()
        dest_file.symlink_to(source_file)
        return
    shutil.copy2(source_file, dest_file)


def build_file_record(candidate: FileCandidate) -> FileRecord:
    file_path = Path(candidate.original_path)
    return FileRecord(
        source_name=candidate.source_name,
        category=candidate.category,
        rel_path=candidate.rel_path,
        original_path=candidate.original_path,
        mirrored_rel_path=candidate.mirrored_rel_path,
        size_bytes=candidate.size_bytes,
        extension=file_path.suffix.lower(),
        is_text=is_probably_text(file_path),
        summary=extract_summary(file_path),
        content_hash=hash_file(file_path),
    )


def scan_source(source: dict, defaults: dict, progress_callback=None) -> tuple[list[FileRecord], list[SkippedRecord]]:
    source_name = source["name"]
    category = source.get("category", "Uncategorized")
    source_path = Path(source["path"]).expanduser().resolve()
    include_patterns = source.get("include", defaults.get("include", []))
    access = defaults["access"]
    exclude_patterns = source.get("exclude", defaults["exclude"]) + access.get("blocked_patterns", [])
    max_size = int(source.get("max_file_size_bytes") or defaults["max_file_size_bytes"])

    if not source_path.exists():
        raise FileNotFoundError(f"Source path does not exist: {source_path}")
    if not source_path.is_dir():
        raise NotADirectoryError(f"Source path is not a directory: {source_path}")
    allowed, reason = evaluate_path_access(source_path, access)
    if not allowed:
        raise ValueError(f"Source path is not accessible: {source_path} ({reason})")

    slug = slugify(source_name)
    candidates: list[FileCandidate] = []
    records: list[FileRecord] = []
    skipped: list[SkippedRecord] = []
    top_level_only = bool(include_patterns) and all(
        "/" not in normalize_pattern(pattern) for pattern in include_patterns
    )

    walked_entries = 0
    for current_root, dirnames, filenames in os.walk(source_path):
        current_root_path = Path(current_root)
        rel_dir = current_root_path.relative_to(source_path)

        if top_level_only and rel_dir == Path("."):
            dirnames[:] = []

        kept_dirs: list[str] = []
        for dirname in dirnames:
            walked_entries += 1
            candidate_dir = (current_root_path / dirname).resolve()
            allowed, reason = evaluate_path_access(candidate_dir, access)
            if not allowed:
                skipped.append(
                    SkippedRecord(
                        source_name,
                        candidate_dir.relative_to(source_path).as_posix(),
                        "blocked",
                    )
                )
                continue
            rel_path = (rel_dir / dirname).as_posix()
            if rel_path == ".":
                rel_path = dirname
            if matches_any(rel_path, dirname, exclude_patterns, mode="exclude"):
                continue
            kept_dirs.append(dirname)
        dirnames[:] = kept_dirs

        for filename in sorted(filenames):
            walked_entries += 1
            file_path = current_root_path / filename
            rel_path = file_path.relative_to(source_path).as_posix()
            allowed, reason = evaluate_path_access(file_path.resolve(), access)
            if not allowed:
                skipped.append(SkippedRecord(source_name, rel_path, "blocked"))
                continue

            if matches_any(rel_path, filename, exclude_patterns, mode="exclude"):
                continue
            if include_patterns and not matches_any(
                rel_path,
                filename,
                include_patterns,
                mode="include",
            ):
                continue
            if file_path.is_symlink():
                skipped.append(SkippedRecord(source_name, rel_path, "symlink"))
                continue
            try:
                size_bytes = file_path.stat().st_size
            except OSError:
                skipped.append(SkippedRecord(source_name, rel_path, "unreadable"))
                continue
            if size_bytes > max_size:
                skipped.append(SkippedRecord(source_name, rel_path, "too_large"))
                continue

            candidates.append(
                FileCandidate(
                    source_name=source_name,
                    category=category,
                    rel_path=rel_path,
                    original_path=str(file_path),
                    mirrored_rel_path=(Path("Sources") / slug / rel_path).as_posix(),
                    size_bytes=size_bytes,
                )
            )

            if progress_callback and len(candidates) % 200 == 0:
                progress_callback(
                    {
                        "message": f"Scanning {source_name}: discovered {len(candidates)} files",
                        "fraction": 0.15,
                    }
                )

    if not candidates:
        if progress_callback:
            progress_callback({"message": f"Scanning {source_name}: no files matched", "fraction": 1.0})
        return records, skipped

    max_workers = min(8, max(1, os.cpu_count() or 4), len(candidates))
    with ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="context-vault-scan") as executor:
        future_map = {executor.submit(build_file_record, candidate): candidate.rel_path for candidate in candidates}
        completed = 0
        total = len(candidates)
        for future in as_completed(future_map):
            records.append(future.result())
            completed += 1
            if progress_callback and (completed == total or completed % 200 == 0):
                progress_callback(
                    {
                        "message": f"Scanning {source_name}: analyzed {completed}/{total} files",
                        "fraction": 0.15 + (completed / total) * 0.85,
                    }
                )

    records.sort(key=lambda item: item.rel_path)

    return records, skipped


def summarize_source(
    source: dict,
    records: list[FileRecord],
    skipped: list[SkippedRecord],
    *,
    default_mode: str,
) -> dict:
    folder_counts: dict[str, int] = {}
    for record in records:
        first_part = Path(record.rel_path).parts[0] if Path(record.rel_path).parts else "."
        folder_counts[first_part] = folder_counts.get(first_part, 0) + 1

    important = [
        record
        for record in records
        if Path(record.rel_path).name in {"README.md", "AGENTS.md", "MASTER_JOURNAL.md", "INDEX.md"}
    ]
    if not important:
        important = records[:8]

    skipped_reasons: dict[str, int] = {}
    for item in skipped:
        skipped_reasons[item.reason] = skipped_reasons.get(item.reason, 0) + 1

    return {
        "name": source["name"],
        "category": source.get("category", "Uncategorized"),
        "source_path": source["path"],
        "mode": source.get("mode") or default_mode,
        "file_count": len(records),
        "skipped_count": len(skipped),
        "entry_files": [
            {
                "rel_path": record.rel_path,
                "mirrored_rel_path": record.mirrored_rel_path,
                "summary": record.summary,
            }
            for record in important
        ],
        "top_folders": [
            {"name": folder, "count": count}
            for folder, count in sorted(folder_counts.items(), key=lambda item: (-item[1], item[0]))[:12]
        ],
        "sample_files": [record.rel_path for record in records[:12]],
        "skipped_reasons": skipped_reasons,
    }


def render_home_note(
    vault_name: str,
    generated_at: str,
    source_summaries: list[dict],
) -> str:
    lines = [
        "---",
        "tags: [context-vault, ai-workspace]",
        f"generated_at: {generated_at}",
        "---",
        f"# {vault_name}",
        "",
        "This vault is meant to be the folder you expose to Claude/Codex when you want a smaller, higher-signal corpus.",
        "",
        "## Sources",
        "",
        "| Source | Category | Files | Skipped | Note |",
        "| --- | --- | ---: | ---: | --- |",
    ]
    for source in source_summaries:
        slug = slugify(source["name"])
        lines.append(
            f"| {source['name']} | {source['category']} | {source['file_count']} | {source['skipped_count']} | [[Maps/{slug}.md|Open map]] |"
        )

    lines.extend(
        [
            "",
            "## Workflow",
            "",
            "1. Open this vault instead of a giant parent folder.",
            "2. Start with the source map note before opening raw files.",
            "3. Use `copy` mode for a hard curated boundary and `symlink` mode only when you need live editing.",
        ]
    )
    return "\n".join(lines) + "\n"


def render_source_note(
    source: dict,
    summary: dict,
    generated_at: str,
) -> str:
    lines = [
        "---",
        f"tags: [source-map, {slugify(source['name'])}]",
        f"generated_at: {generated_at}",
        f"source_path: {source['path']}",
        f"mode: {summary['mode']}",
        "---",
        f"# {source['name']}",
        "",
        f"- Category: `{summary['category']}`",
        f"- Original path: `{summary['source_path']}`",
        f"- Included files: `{summary['file_count']}`",
        f"- Skipped files: `{summary['skipped_count']}`",
        "",
        "## Entry Files",
        "",
    ]

    if summary["entry_files"]:
        for record in summary["entry_files"]:
            lines.append(
                f"- [{record['rel_path']}](../{record['mirrored_rel_path']})"
                + (f" - {record['summary']}" if record["summary"] else "")
            )
    else:
        lines.append("- No files matched the current include rules.")

    lines.extend(["", "## Top Folders", ""])
    if summary["top_folders"]:
        for folder in summary["top_folders"]:
            lines.append(f"- `{folder['name']}`: {folder['count']} files")
    else:
        lines.append("- No folders yet.")

    if summary["skipped_reasons"]:
        lines.extend(["", "## Skipped", ""])
        for reason, count in sorted(summary["skipped_reasons"].items()):
            lines.append(f"- `{reason}`: {count}")

    return "\n".join(lines) + "\n"


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def build_feature_clusters(records: list[FileRecord]) -> list[dict[str, object]]:
    by_category: dict[str, list[FileRecord]] = {}
    by_source: dict[str, list[FileRecord]] = {}
    by_extension: dict[str, list[FileRecord]] = {}

    for record in records:
        by_category.setdefault(record.category or "Uncategorized", []).append(record)
        by_source.setdefault(record.source_name, []).append(record)
        extension = record.extension or "no-extension"
        by_extension.setdefault(extension, []).append(record)

    clusters: list[dict[str, object]] = []

    for category, items in sorted(by_category.items(), key=lambda item: (-len(item[1]), item[0].lower())):
        clusters.append(
            {
                "id": f"category:{slugify(category)}",
                "type": "category",
                "label": category,
                "file_count": len(items),
                "examples": [record.rel_path for record in items[:5]],
            }
        )

    for source_name, items in sorted(by_source.items(), key=lambda item: (-len(item[1]), item[0].lower())):
        clusters.append(
            {
                "id": f"source:{slugify(source_name)}",
                "type": "source",
                "label": source_name,
                "file_count": len(items),
                "examples": [record.rel_path for record in items[:5]],
            }
        )

    for extension, items in sorted(by_extension.items(), key=lambda item: (-len(item[1]), item[0].lower()))[:8]:
        clusters.append(
            {
                "id": f"extension:{slugify(extension)}",
                "type": "extension",
                "label": extension,
                "file_count": len(items),
                "examples": [record.rel_path for record in items[:5]],
            }
        )

    return clusters


def build_architecture_summary(
    *,
    vault_name: str,
    summary: dict,
    source_summaries: list[dict],
    feature_clusters: list[dict[str, object]],
    access: dict,
) -> str:
    lines = [
        f"# {vault_name} Snapshot",
        "",
        f"- Generated at: `{summary['generated_at']}`",
        f"- Sources: `{summary['source_count']}`",
        f"- Files: `{summary['file_count']}`",
        f"- Edges: `{summary['edge_count']}`",
        f"- Skipped: `{summary['skipped_count']}`",
        "",
        "## Sources",
        "",
    ]

    for source in source_summaries:
        lines.append(
            f"- **{source['name']}** (`{source['category']}`): "
            f"{source['file_count']} files from `{source['source_path']}`"
        )

    lines.extend(["", "## Feature Clusters", ""])
    if feature_clusters:
        for cluster in feature_clusters[:10]:
            examples = ", ".join(f"`{item}`" for item in cluster.get("examples", [])[:3])
            lines.append(
                f"- **{cluster['label']}** ({cluster['type']}): {cluster['file_count']} files"
                + (f" — {examples}" if examples else "")
            )
    else:
        lines.append("- No clusters generated.")

    lines.extend(["", "## Policy Summary", ""])
    lines.append(f"- Allowed roots: `{len(access.get('allowed_roots', []))}`")
    lines.append(f"- Blocked paths: `{len(access.get('blocked_paths', []))}`")
    lines.append(f"- Blocked patterns: `{len(access.get('blocked_patterns', []))}`")
    lines.append(
        "- Copy-only boundary: "
        + ("enabled" if access.get("enforce_copy_mode", True) else "disabled")
    )

    return "\n".join(lines) + "\n"


def build_snapshot_bundle_payload(
    *,
    vault_name: str,
    generated_at: str,
    normalized: dict,
    summary: dict,
    source_summaries: list[dict],
    all_records: list[FileRecord],
    all_skipped: list[SkippedRecord],
    nodes: list[dict[str, object]],
    edges: list[dict[str, str]],
    artifacts: dict,
    dry_run: bool,
) -> dict:
    feature_clusters = build_feature_clusters(all_records)
    architecture_summary = build_architecture_summary(
        vault_name=vault_name,
        summary=summary,
        source_summaries=source_summaries,
        feature_clusters=feature_clusters,
        access=normalized.get("access", {}),
    )
    sources = normalized.get("sources", [])

    return {
        "id": f"snapshot-{slugify(vault_name)}-{'preview' if dry_run else 'build'}-{uuid.uuid4().hex[:8]}",
        "created_at": generated_at,
        "label": f"{vault_name} {'preview' if dry_run else 'build'} snapshot",
        "kind": "preview" if dry_run else "build",
        "summary": summary,
        "snapshot_meta": {
            "version": 1,
            "generated_at": generated_at,
            "vault_name": vault_name,
            "dry_run": dry_run,
            "artifacts": artifacts,
        },
        "file_manifest": {
            "summary": summary,
            "files": [asdict(record) for record in all_records],
            "skipped": [asdict(record) for record in all_skipped],
        },
        "edges": {
            "summary": {
                "node_count": len(nodes),
                "edge_count": len(edges),
            },
            "nodes": nodes,
            "edges": edges,
        },
        "feature_clusters": feature_clusters,
        "architecture_summary": architecture_summary,
        "policy_bundle": {
            "access": normalized.get("access", {}),
            "default_mode": normalized.get("default_mode", "copy"),
            "default_include": normalized.get("default_include", []),
            "default_exclude": normalized.get("default_exclude", []),
            "sources": [
                {
                    "name": source.get("name"),
                    "category": source.get("category"),
                    "path": source.get("path"),
                    "include": source.get("include", []),
                    "exclude": source.get("exclude", []),
                    "mode": source.get("mode") or normalized.get("default_mode", "copy"),
                }
                for source in sources
            ],
        },
        "slcs_context": {
            "status": "not_configured",
            "relevant_sources": [source.get("name") for source in sources],
            "note": "Build can later consume this scoped snapshot bundle instead of raw repo state.",
        },
    }


def build_workspace_from_config(
    config: dict,
    *,
    base_dir: Path,
    dry_run: bool,
    clean: bool,
    progress_callback=None,
) -> dict:
    normalized = resolve_config_paths(config, base_dir=base_dir)
    vault_name = normalized.get("vault_name", "Curated Context Vault")
    output_dir = Path(normalized.get("output_dir", base_dir / "build" / "context-vault")).resolve()
    generated_at = now_iso()
    defaults = {
        "exclude": normalized.get("default_exclude", DEFAULT_EXCLUDES),
        "include": normalized.get("default_include", []),
        "max_file_size_bytes": int(normalized.get("max_file_size_bytes", 5_000_000)),
        "access": normalized.get("access", {}),
    }
    source_specs = normalized.get("sources", [])
    if not source_specs:
        raise ValueError("Config must define at least one source.")

    vault_dir = output_dir / "vault"
    maps_dir = vault_dir / "Maps"
    graph_dir = output_dir / "graph"

    if not dry_run:
        ensure_clean_dir(output_dir, clean)
        maps_dir.mkdir(parents=True, exist_ok=True)
        graph_dir.mkdir(parents=True, exist_ok=True)
    if progress_callback:
        progress_callback({"progress": 6, "message": "Workspace initialized"})

    all_records: list[FileRecord] = []
    all_skipped: list[SkippedRecord] = []
    source_summaries: list[dict] = []
    nodes: list[dict[str, object]] = []
    edges: list[dict[str, str]] = []

    total_sources = max(len(source_specs), 1)
    for source_index, source in enumerate(source_specs, start=1):
        source_progress_start = 10 + int(((source_index - 1) / total_sources) * 55)
        source_progress_end = 10 + int((source_index / total_sources) * 55)

        def source_progress(detail: dict) -> None:
            if not progress_callback:
                return
            fraction = max(0.0, min(1.0, float(detail.get("fraction", 0.0))))
            mapped_progress = source_progress_start + int((source_progress_end - source_progress_start) * fraction)
            progress_callback(
                {
                    "progress": mapped_progress,
                    "message": detail.get("message", f"Scanning {source['name']}"),
                }
            )

        if progress_callback:
            progress_callback(
                {
                    "progress": source_progress_start,
                    "message": f"Scanning {source['name']}",
                }
            )
        records, skipped = scan_source(source, defaults, progress_callback=source_progress)
        summary = summarize_source(
            source,
            records,
            skipped,
            default_mode=normalized.get("default_mode", "copy"),
        )
        source_summaries.append(summary)
        all_records.extend(records)
        all_skipped.extend(skipped)

        nodes.append(
            {
                "id": f"source:{source['name']}",
                "type": "source",
                "name": source["name"],
                "category": source.get("category", "Uncategorized"),
                "path": source["path"],
                "mode": source.get("mode", normalized.get("default_mode", "copy")),
                "file_count": len(records),
            }
        )

        for record in records:
            nodes.append(
                {
                    "id": f"file:{record.source_name}:{record.rel_path}",
                    "type": "file",
                    "source": record.source_name,
                    "category": record.category,
                    "rel_path": record.rel_path,
                    "mirrored_rel_path": record.mirrored_rel_path,
                    "original_path": record.original_path,
                    "extension": record.extension,
                    "size_bytes": record.size_bytes,
                        "summary": record.summary,
                        "label": Path(record.rel_path).name,
                    }
                )
            edges.append(
                {
                    "type": "contains",
                    "from": f"source:{record.source_name}",
                    "to": f"file:{record.source_name}:{record.rel_path}",
                }
            )

        for record in records:
            edges.extend(extract_edges(record, records))

        if not dry_run:
            mode = (source.get("mode") or normalized.get("default_mode", "copy")).lower()
            if normalized.get("access", {}).get("enforce_copy_mode", True):
                mode = "copy"
            if mode not in {"copy", "symlink"}:
                raise ValueError(f"Unsupported mode for {source['name']}: {mode}")
            for record in records:
                dest_path = vault_dir / record.mirrored_rel_path
                copy_or_link(Path(record.original_path), dest_path, mode)

            source_note_path = maps_dir / f"{slugify(source['name'])}.md"
            source_note_path.write_text(
                render_source_note(source, summary, generated_at),
                encoding="utf-8",
            )
        if progress_callback:
            progress_callback(
                {
                    "progress": 10 + int((source_index / total_sources) * 65),
                    "message": f"Indexed {source['name']}",
                }
            )

    summary = {
        "generated_at": generated_at,
        "vault_name": vault_name,
        "source_count": len(source_specs),
        "file_count": len(all_records),
        "skipped_count": len(all_skipped),
        "text_file_count": sum(1 for record in all_records if record.is_text),
        "node_count": len(nodes),
        "edge_count": len(edges),
    }

    artifacts = {
        "output_dir": str(output_dir),
        "vault_dir": str(vault_dir),
        "home_note": str(vault_dir / "Home.md"),
        "graph_file": str(graph_dir / "context_graph.json"),
        "manifest_file": str(graph_dir / "manifest.json"),
    }

    if not dry_run:
        if progress_callback:
            progress_callback({"progress": 86, "message": "Writing vault notes"})
        (vault_dir / "Home.md").write_text(
            render_home_note(vault_name, generated_at, source_summaries),
            encoding="utf-8",
        )
        if progress_callback:
            progress_callback({"progress": 92, "message": "Writing graph artifacts"})
        write_json(
            graph_dir / "context_graph.json",
            {
                "summary": summary,
                "nodes": nodes,
                "edges": edges,
            },
        )
        write_json(
            graph_dir / "manifest.json",
            {
                "summary": summary,
                "files": [asdict(record) for record in all_records],
                "skipped": [asdict(record) for record in all_skipped],
            },
        )
    if progress_callback:
        progress_callback({"progress": 98, "message": "Finalizing result"})

    snapshot_bundle_payload = build_snapshot_bundle_payload(
        vault_name=vault_name,
        generated_at=generated_at,
        normalized=normalized,
        summary=summary,
        source_summaries=source_summaries,
        all_records=all_records,
        all_skipped=all_skipped,
        nodes=nodes,
        edges=edges,
        artifacts=artifacts,
        dry_run=dry_run,
    )

    return {
        "config": normalized,
        "summary": summary,
        "artifacts": artifacts,
        "source_summaries": source_summaries,
        "snapshot_bundle_payload": snapshot_bundle_payload,
        "graph": {
            "nodes": nodes,
            "edges": edges,
        },
        "files": [
            {
                **asdict(record),
                "id": f"file:{record.source_name}:{record.rel_path}",
                "label": Path(record.rel_path).name,
            }
            for record in all_records
        ],
        "access": {
            "allowed_roots": normalized.get("access", {}).get("allowed_roots", []),
            "blocked_paths": normalized.get("access", {}).get("blocked_paths", []),
            "blocked_patterns": normalized.get("access", {}).get("blocked_patterns", []),
            "enforce_copy_mode": normalized.get("access", {}).get("enforce_copy_mode", True),
        },
        "dry_run": dry_run,
    }


def build_workspace_from_file(config_path: Path, *, dry_run: bool, clean: bool) -> dict:
    config = json.loads(config_path.read_text(encoding="utf-8"))
    return build_workspace_from_config(
        config,
        base_dir=config_path.parent.resolve(),
        dry_run=dry_run,
        clean=clean,
    )
