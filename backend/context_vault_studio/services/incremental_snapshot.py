from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path

from context_vault_studio.services.workspace_builder import build_workspace_from_config
from context_vault_studio.storage import REPO_ROOT, save_delta_snapshot


def _now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def build_delta_snapshot(config: dict, previous_snapshot_bundle: dict) -> dict:
    current_result = build_workspace_from_config(
        config,
        base_dir=Path(REPO_ROOT),
        dry_run=True,
        clean=True,
    )

    previous_manifest = (previous_snapshot_bundle.get("contents") or {}).get("file_manifest") or {}
    previous_files = {
        item["rel_path"]: item.get("content_hash")
        for item in previous_manifest.get("files", [])
        if item.get("rel_path")
    }
    current_files = {
        item["rel_path"]: item.get("content_hash")
        for item in current_result.get("files", [])
        if item.get("rel_path")
    }

    added = sorted(path for path in current_files if path not in previous_files)
    removed = sorted(path for path in previous_files if path not in current_files)
    changed = sorted(
        path
        for path in current_files
        if path in previous_files and current_files[path] != previous_files[path]
    )

    delta = {
        "previous_snapshot_bundle_id": previous_snapshot_bundle.get("id"),
        "generated_at": _now_iso(),
        "added_files": added,
        "removed_files": removed,
        "changed_files": changed,
        "current_summary": current_result.get("summary", {}),
    }
    record = save_delta_snapshot(
        {
            "id": f"delta-snapshot-{uuid.uuid4().hex[:8]}",
            "label": f"Delta for {config.get('vault_name', 'Context Vault Studio')}",
            "delta": delta,
            "changed_count": len(changed),
            "added_count": len(added),
            "removed_count": len(removed),
        }
    )
    return {
        "record": record,
        "delta": delta,
        "current_snapshot_bundle_payload": current_result.get("snapshot_bundle_payload"),
    }
