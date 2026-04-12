from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from context_vault_studio.services.workspace_builder import (
    DEFAULT_EXCLUDES,
    evaluate_path_access,
    evaluate_relative_access,
    matches_any,
    resolve_config_paths,
)
from context_vault_studio.storage import REPO_ROOT


_MONITORS: dict[str, dict] = {}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _now_iso() -> str:
    return _now().astimezone().isoformat(timespec="seconds")


def _snapshot_state(config: dict) -> dict[str, dict]:
    normalized = resolve_config_paths(config, base_dir=REPO_ROOT)
    defaults = {
        "exclude": normalized.get("default_exclude", DEFAULT_EXCLUDES),
        "include": normalized.get("default_include", []),
        "access": normalized.get("access", {}),
    }
    state: dict[str, dict] = {}

    for source in normalized.get("sources", []):
        source_path = Path(source["path"]).expanduser().resolve()
        include_patterns = source.get("include", defaults.get("include", []))
        exclude_patterns = source.get("exclude", defaults["exclude"]) + defaults["access"].get("blocked_patterns", [])
        access = defaults["access"]

        if not source_path.exists() or not source_path.is_dir():
            continue
        allowed, _reason = evaluate_path_access(source_path, access)
        if not allowed:
            continue

        for current_root, dirnames, filenames in os.walk(source_path):
            current_root_path = Path(current_root)
            rel_dir = current_root_path.relative_to(source_path)

            kept_dirs: list[str] = []
            for dirname in dirnames:
                candidate_dir = (current_root_path / dirname).resolve()
                allowed, _reason = evaluate_path_access(candidate_dir, access)
                if not allowed:
                    continue
                rel_path = (rel_dir / dirname).as_posix()
                if rel_path == ".":
                    rel_path = dirname
                if matches_any(rel_path, dirname, exclude_patterns, mode="exclude"):
                    continue
                kept_dirs.append(dirname)
            dirnames[:] = kept_dirs

            for filename in filenames:
                file_path = current_root_path / filename
                rel_path = file_path.relative_to(source_path).as_posix()
                allowed, _reason = evaluate_path_access(file_path.resolve(), access)
                if not allowed:
                    continue
                allowed, _reason = evaluate_relative_access(rel_path, filename, access)
                if not allowed:
                    continue
                if matches_any(rel_path, filename, exclude_patterns, mode="exclude"):
                    continue
                if include_patterns and not matches_any(rel_path, filename, include_patterns, mode="include"):
                    continue
                try:
                    stat = file_path.stat()
                except OSError:
                    continue
                state[str(file_path.resolve())] = {
                    "path": str(file_path.resolve()),
                    "rel_path": rel_path,
                    "mtime": stat.st_mtime,
                    "size_bytes": stat.st_size,
                    "source_name": source["name"],
                }
    return state


def start_live_monitor(config: dict, *, debounce_ms: int) -> dict:
    monitor_id = f"monitor-{uuid.uuid4().hex[:8]}"
    baseline = _snapshot_state(config)
    record = {
        "id": monitor_id,
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
        "debounce_ms": debounce_ms,
        "config": config,
        "baseline": baseline,
        "pending_events": [],
        "batches": [],
    }
    _MONITORS[monitor_id] = record
    return {
        "id": monitor_id,
        "created_at": record["created_at"],
        "debounce_ms": debounce_ms,
        "tracked_file_count": len(baseline),
        "pending_event_count": 0,
    }


def get_live_monitor(monitor_id: str) -> dict | None:
    record = _MONITORS.get(monitor_id)
    if not record:
        return None
    return {
        "id": record["id"],
        "created_at": record["created_at"],
        "updated_at": record["updated_at"],
        "debounce_ms": record["debounce_ms"],
        "tracked_file_count": len(record["baseline"]),
        "pending_event_count": len(record["pending_events"]),
        "batch_count": len(record["batches"]),
    }


def poll_live_monitor(monitor_id: str) -> dict | None:
    record = _MONITORS.get(monitor_id)
    if not record:
        return None

    current = _snapshot_state(record["config"])
    previous = record["baseline"]
    events: list[dict] = []

    for path, meta in current.items():
        previous_meta = previous.get(path)
        if not previous_meta:
            events.append({"kind": "created", **meta, "detected_at": _now_iso()})
        elif previous_meta["mtime"] != meta["mtime"] or previous_meta["size_bytes"] != meta["size_bytes"]:
            events.append({"kind": "modified", **meta, "detected_at": _now_iso()})

    for path, meta in previous.items():
        if path not in current:
            events.append({"kind": "deleted", **meta, "detected_at": _now_iso()})

    record["baseline"] = current
    record["pending_events"].extend(events)
    record["updated_at"] = _now_iso()
    return {
        "id": monitor_id,
        "new_event_count": len(events),
        "pending_event_count": len(record["pending_events"]),
        "events": events,
    }


def flush_live_monitor(monitor_id: str) -> dict | None:
    record = _MONITORS.get(monitor_id)
    if not record:
        return None
    events = record["pending_events"]
    batch = {
        "id": f"batch-{uuid.uuid4().hex[:8]}",
        "created_at": _now_iso(),
        "events": events,
        "summary": {
            "created": sum(1 for item in events if item["kind"] == "created"),
            "modified": sum(1 for item in events if item["kind"] == "modified"),
            "deleted": sum(1 for item in events if item["kind"] == "deleted"),
        },
    }
    record["batches"].insert(0, batch)
    record["pending_events"] = []
    record["updated_at"] = _now_iso()
    return batch
