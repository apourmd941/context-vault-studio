from __future__ import annotations

from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from pathlib import Path
from time import perf_counter
import uuid

from context_vault_studio.services.workspace_builder import (
    DEFAULT_EXCLUDES,
    evaluate_path_access,
    evaluate_relative_access,
    extract_summary,
    is_probably_text,
    matches_any,
    normalize_pattern,
    resolve_config_paths,
)
from context_vault_studio.services.worker_policy import reserve_worker_budget
from context_vault_studio.storage import REPO_ROOT, save_parallel_scan_profile


def _profile_path(path_value: str) -> dict:
    path = Path(path_value)
    return {
        "path": str(path),
        "size_bytes": path.stat().st_size if path.exists() and path.is_file() else 0,
        "extension": path.suffix.lower(),
        "is_text": is_probably_text(path),
        "summary": extract_summary(path),
    }


def _discover_source_files(source: dict, defaults: dict) -> list[str]:
    root = Path(source["path"]).expanduser().resolve()
    access = defaults.get("access", {})
    accessible, _reason = evaluate_path_access(root, access)
    if not accessible or not root.exists() or not root.is_dir():
        return []

    include_patterns = [normalize_pattern(item) for item in (source.get("include") or defaults.get("include") or ["**/*"])]
    exclude_patterns = [
        normalize_pattern(item)
        for item in [
            *(defaults.get("exclude") or DEFAULT_EXCLUDES),
            *(source.get("exclude") or []),
        ]
    ]

    discovered: list[str] = []
    for candidate in root.rglob("*"):
        if not candidate.is_file():
            continue
        rel_posix = candidate.relative_to(root).as_posix()
        accessible, _reason = evaluate_relative_access(rel_posix, candidate.name, access)
        if not accessible:
            continue
        if matches_any(rel_posix, candidate.name, exclude_patterns, mode="exclude"):
            continue
        if include_patterns and not matches_any(rel_posix, candidate.name, include_patterns, mode="include"):
            continue
        discovered.append(str(candidate))
    return discovered


def build_parallel_scan_profile(config: dict, *, base_dir: Path | None = None, max_workers: int = 8) -> dict:
    started = perf_counter()
    normalized = resolve_config_paths(config, base_dir=base_dir or REPO_ROOT)
    defaults = {
        "exclude": normalized.get("default_exclude", DEFAULT_EXCLUDES),
        "include": normalized.get("default_include", []),
        "access": normalized.get("access", {}),
    }
    sources = normalized.get("sources", [])

    with reserve_worker_budget(max_workers) as worker_count:
        discovery_started = perf_counter()
        with ThreadPoolExecutor(max_workers=min(worker_count, max(len(sources), 1))) as executor:
            discovery_batches = list(executor.map(lambda source: _discover_source_files(source, defaults), sources))
        discovered_files = [item for batch in discovery_batches for item in batch]
        discovery_seconds = perf_counter() - discovery_started

        parse_started = perf_counter()
        with ProcessPoolExecutor(max_workers=worker_count) as executor:
            profiled_files = list(executor.map(_profile_path, discovered_files))
        parse_seconds = perf_counter() - parse_started

        merge_started = perf_counter()
        extension_counts: dict[str, int] = {}
        total_size_bytes = 0
        for item in profiled_files:
            extension = item["extension"] or "no-extension"
            extension_counts[extension] = extension_counts.get(extension, 0) + 1
            total_size_bytes += item["size_bytes"]
        top_extensions = sorted(extension_counts.items(), key=lambda entry: (-entry[1], entry[0]))[:8]
        merge_seconds = perf_counter() - merge_started

        profile = {
            "summary": {
                "source_count": len(sources),
                "file_count": len(profiled_files),
                "worker_count": worker_count,
                "total_size_bytes": total_size_bytes,
            },
            "timings": {
                "discovery_seconds": round(discovery_seconds, 4),
                "parse_seconds": round(parse_seconds, 4),
                "merge_seconds": round(merge_seconds, 4),
                "total_seconds": round(perf_counter() - started, 4),
            },
            "top_extensions": [{"extension": extension, "count": count} for extension, count in top_extensions],
            "files": profiled_files[:200],
        }

    record = save_parallel_scan_profile(
        {
            "id": f"parallel-scan-{uuid.uuid4().hex[:8]}",
            "label": f"{normalized.get('vault_name', 'Context Vault Studio')} parallel scan",
            "profile": profile,
            "source_count": len(sources),
            "file_count": len(profiled_files),
            "worker_count": worker_count,
        }
    )
    return {"record": record, "profile": profile}
