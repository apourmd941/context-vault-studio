from __future__ import annotations

from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from time import perf_counter
import re
import uuid

from context_vault_studio.services.workspace_builder import build_workspace_from_config, read_text_safe
from context_vault_studio.services.worker_policy import reserve_worker_budget
from context_vault_studio.storage import REPO_ROOT, save_logic_profile


IMPORT_RE = re.compile(r"^\s*(?:from\s+([A-Za-z0-9_\.]+)\s+import|import\s+([A-Za-z0-9_\.]+))", re.MULTILINE)
PY_SYMBOL_RE = re.compile(r"^\s*(?:def|class)\s+([A-Za-z_][A-Za-z0-9_]*)", re.MULTILINE)
JS_SYMBOL_RE = re.compile(r"^\s*(?:export\s+)?(?:function|class|const)\s+([A-Za-z_][A-Za-z0-9_]*)", re.MULTILINE)
FASTAPI_ROUTE_RE = re.compile(r"@\s*(?:app|router)\.(?:get|post|put|delete|patch)\(")
EXPRESS_ROUTE_RE = re.compile(r"\b(?:app|router)\.(?:get|post|put|delete|patch)\(")
STORAGE_HINT_RE = re.compile(r"\b(sqlite|postgres|mysql|prisma|redis|storage|bucket|s3)\b", re.IGNORECASE)


def _analyze_file(file_entry: dict) -> dict:
    path = Path(file_entry["original_path"])
    text = read_text_safe(path) if path.exists() else ""
    imports = []
    for match in IMPORT_RE.finditer(text):
        imports.append(match.group(1) or match.group(2))
    symbols = PY_SYMBOL_RE.findall(text) + JS_SYMBOL_RE.findall(text)
    route_count = len(FASTAPI_ROUTE_RE.findall(text)) + len(EXPRESS_ROUTE_RE.findall(text))
    storage_hints = sorted(set(STORAGE_HINT_RE.findall(text)))
    return {
        "rel_path": file_entry["rel_path"],
        "original_path": file_entry["original_path"],
        "imports": imports,
        "symbols": symbols[:20],
        "route_count": route_count,
        "storage_hints": storage_hints,
    }


def build_logic_profile(config: dict, *, max_workers: int = 8, selected_files: list[str] | None = None) -> dict:
    started = perf_counter()
    result = build_workspace_from_config(config, base_dir=Path(REPO_ROOT), dry_run=True, clean=True)
    files = result.get("files", [])
    selected = {item for item in (selected_files or []) if item}
    if selected:
        files = [item for item in files if item.get("rel_path") in selected]

    with reserve_worker_budget(max_workers) as worker_count:
        with ProcessPoolExecutor(max_workers=worker_count) as executor:
            analyses = list(executor.map(_analyze_file, files))

    import_count = sum(len(item["imports"]) for item in analyses)
    symbol_count = sum(len(item["symbols"]) for item in analyses)
    route_count = sum(item["route_count"] for item in analyses)
    storage_touch_count = sum(1 for item in analyses if item["storage_hints"])

    feature_clusters: dict[str, int] = {}
    for file_entry in files:
        source_name = file_entry.get("source_name", "Unknown")
        feature_clusters[source_name] = feature_clusters.get(source_name, 0) + 1

    profile = {
        "summary": {
            "file_count": len(files),
            "import_count": import_count,
            "symbol_count": symbol_count,
            "route_count": route_count,
            "storage_touch_count": storage_touch_count,
            "worker_count": worker_count,
            "elapsed_seconds": round(perf_counter() - started, 4),
        },
        "feature_clusters": [
            {"label": label, "file_count": count}
            for label, count in sorted(feature_clusters.items(), key=lambda item: (-item[1], item[0]))
        ],
        "files": analyses[:200],
    }

    record = save_logic_profile(
        {
            "id": f"logic-profile-{uuid.uuid4().hex[:8]}",
            "label": f"{config.get('vault_name', 'Context Vault Studio')} logic profile" + (" (scoped)" if selected else ""),
            "profile": profile,
        }
    )
    return {"record": record, "profile": profile}
