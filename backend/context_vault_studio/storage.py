from __future__ import annotations

import json
import os
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path


APP_ID = "context-vault-studio"
APP_NAME = "Context Vault Studio"
APP_DESCRIPTION = "Obsidian-inspired curated AI workspace builder"
REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_STATE_DIR = REPO_ROOT / "data" / "app_state"
STATE_DIR = Path(os.environ.get("CONTEXT_VAULT_STATE_DIR", DEFAULT_STATE_DIR)).expanduser()
WORKSPACE_CONFIG_PATH = STATE_DIR / "workspace_config.json"
LAST_RESULT_PATH = STATE_DIR / "last_result.json"
PRESETS_PATH = STATE_DIR / "presets.json"
BUILD_HISTORY_PATH = STATE_DIR / "build_history.json"
BOOKMARKS_PATH = STATE_DIR / "bookmarks.json"
LAYOUT_PATH = STATE_DIR / "layout.json"
SNAPSHOTS_PATH = STATE_DIR / "snapshots.json"
CANVASES_PATH = STATE_DIR / "canvases.json"
SNAPSHOT_BUNDLES_PATH = STATE_DIR / "snapshot_bundles.json"
SNAPSHOT_BUNDLES_DIR = STATE_DIR / "snapshot_bundles"
BUILD_PATCH_PREVIEWS_PATH = STATE_DIR / "build_patch_previews.json"
BUILD_PATCH_PREVIEWS_DIR = STATE_DIR / "build_patch_previews"
STARTER_CONFIG_PATH = REPO_ROOT / "configs" / "starter_workspace.json"
GUIDED_DEMO_CONFIG_PATH = REPO_ROOT / "configs" / "guided_demo.json"
LOCAL_NEUTRON_EXAMPLE_PATH = REPO_ROOT / "config" / "neutron_curated.example.json"


def ensure_state_dir() -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)


def _read_json(path: Path) -> dict | list | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, payload: dict | list) -> None:
    ensure_state_dir()
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def _now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def _resolve_path_value(value: str, *, base_dir: Path) -> str:
    expanded = Path(value).expanduser()
    if expanded.is_absolute():
        return str(expanded)
    return str((base_dir / expanded).resolve())


def _normalize_config(config: dict, *, base_dir: Path) -> dict:
    normalized = deepcopy(config)
    normalized["output_dir"] = _resolve_path_value(normalized["output_dir"], base_dir=base_dir)
    for source in normalized.get("sources", []):
        source["path"] = _resolve_path_value(source["path"], base_dir=base_dir)
    return normalized


def load_examples() -> list[dict]:
    examples: list[dict] = []

    guided_demo = _read_json(GUIDED_DEMO_CONFIG_PATH)
    if isinstance(guided_demo, dict):
        examples.append(
            {
                "id": "guided-demo",
                "label": "Guided Demo",
                "description": "A small bundled workspace that previews and builds successfully out of the box.",
                "config": _normalize_config(guided_demo, base_dir=GUIDED_DEMO_CONFIG_PATH.parent),
            }
        )

    starter = _read_json(STARTER_CONFIG_PATH)
    if isinstance(starter, dict):
        examples.append(
            {
                "id": "starter",
                "label": "Starter Vault",
                "description": "Blank starter layout for docs, projects, and research.",
                "config": _normalize_config(starter, base_dir=STARTER_CONFIG_PATH.parent),
            }
        )

    local_example = _read_json(LOCAL_NEUTRON_EXAMPLE_PATH)
    if isinstance(local_example, dict):
        examples.append(
            {
                "id": "neutron-local",
                "label": "Local Neutron Example",
                "description": "Preloaded with your current Neutron folders and manuals.",
                "config": _normalize_config(local_example, base_dir=LOCAL_NEUTRON_EXAMPLE_PATH.parent),
            }
        )

    return examples


def load_presets() -> list[dict]:
    payload = _read_json(PRESETS_PATH)
    if isinstance(payload, list):
        return payload

    starter_presets = []
    for example in load_examples():
        starter_presets.append(
            {
                "id": example["id"],
                "name": example["label"],
                "description": example["description"],
                "config": example["config"],
                "created_at": _now_iso(),
                "updated_at": _now_iso(),
            }
        )
    return starter_presets


def save_presets(presets: list[dict]) -> None:
    _write_json(PRESETS_PATH, presets)


def upsert_preset(*, preset_id: str | None, name: str, description: str, config: dict) -> dict:
    presets = load_presets()
    target_id = preset_id or str(uuid.uuid4())
    now = _now_iso()
    replacement = {
        "id": target_id,
        "name": name,
        "description": description,
        "config": config,
        "created_at": now,
        "updated_at": now,
    }

    next_presets: list[dict] = []
    found = False
    for preset in presets:
        if preset["id"] == target_id:
            replacement["created_at"] = preset.get("created_at", now)
            next_presets.append(replacement)
            found = True
        else:
            next_presets.append(preset)
    if not found:
        next_presets.append(replacement)
    save_presets(next_presets)
    return replacement


def delete_preset(preset_id: str) -> None:
    presets = [preset for preset in load_presets() if preset["id"] != preset_id]
    save_presets(presets)


def load_build_history() -> list[dict]:
    payload = _read_json(BUILD_HISTORY_PATH)
    return payload if isinstance(payload, list) else []


def append_build_history(entry: dict) -> None:
    history = load_build_history()
    history.insert(0, entry)
    _write_json(BUILD_HISTORY_PATH, history[:50])


def load_snapshot_bundles() -> list[dict]:
    payload = _read_json(SNAPSHOT_BUNDLES_PATH)
    return payload if isinstance(payload, list) else []


def _snapshot_bundle_dir(bundle_id: str) -> Path:
    return SNAPSHOT_BUNDLES_DIR / bundle_id


def save_snapshot_bundle(payload: dict) -> dict:
    ensure_state_dir()
    SNAPSHOT_BUNDLES_DIR.mkdir(parents=True, exist_ok=True)

    bundle_id = payload.get("id") or str(uuid.uuid4())
    created_at = payload.get("created_at") or _now_iso()
    bundle_dir = _snapshot_bundle_dir(bundle_id)
    bundle_dir.mkdir(parents=True, exist_ok=True)

    artifact_paths = {
        "snapshot_meta_file": bundle_dir / "snapshot_meta.json",
        "file_manifest_file": bundle_dir / "file_manifest.json",
        "edges_file": bundle_dir / "edges.json",
        "feature_clusters_file": bundle_dir / "feature_clusters.json",
        "policy_bundle_file": bundle_dir / "policy_bundle.json",
        "slcs_context_file": bundle_dir / "slcs_context.json",
        "architecture_summary_file": bundle_dir / "architecture_summary.md",
    }

    artifact_paths["snapshot_meta_file"].write_text(
        json.dumps(payload.get("snapshot_meta", {}), indent=2) + "\n",
        encoding="utf-8",
    )
    artifact_paths["file_manifest_file"].write_text(
        json.dumps(payload.get("file_manifest", {}), indent=2) + "\n",
        encoding="utf-8",
    )
    artifact_paths["edges_file"].write_text(
        json.dumps(payload.get("edges", {}), indent=2) + "\n",
        encoding="utf-8",
    )
    artifact_paths["feature_clusters_file"].write_text(
        json.dumps(payload.get("feature_clusters", []), indent=2) + "\n",
        encoding="utf-8",
    )
    artifact_paths["policy_bundle_file"].write_text(
        json.dumps(payload.get("policy_bundle", {}), indent=2) + "\n",
        encoding="utf-8",
    )
    artifact_paths["slcs_context_file"].write_text(
        json.dumps(payload.get("slcs_context", {}), indent=2) + "\n",
        encoding="utf-8",
    )
    artifact_paths["architecture_summary_file"].write_text(
        payload.get("architecture_summary", "").rstrip() + "\n",
        encoding="utf-8",
    )

    file_manifest = payload.get("file_manifest", {})
    edges_payload = payload.get("edges", {})
    feature_clusters = payload.get("feature_clusters", [])
    slcs_context = payload.get("slcs_context", {})

    record = {
        "id": bundle_id,
        "created_at": created_at,
        "label": payload.get("label") or "Snapshot bundle",
        "kind": payload.get("kind") or "preview",
        "summary": payload.get("summary", {}),
        "bundle_dir": str(bundle_dir),
        "artifacts": {key: str(value) for key, value in artifact_paths.items()},
        "file_count": len(file_manifest.get("files", [])),
        "edge_count": len(edges_payload.get("edges", [])),
        "feature_cluster_count": len(feature_clusters),
        "slcs_status": slcs_context.get("status", "not_configured"),
    }

    existing = load_snapshot_bundles()
    next_records = [record]
    for item in existing:
        if item.get("id") != bundle_id:
            next_records.append(item)
    _write_json(SNAPSHOT_BUNDLES_PATH, next_records[:120])
    return record


def load_snapshot_bundle(bundle_id: str) -> dict | None:
    record = next((item for item in load_snapshot_bundles() if item.get("id") == bundle_id), None)
    if not record:
        return None

    artifacts = record.get("artifacts", {})
    bundle = deepcopy(record)
    bundle["contents"] = {
        "snapshot_meta": _read_json(Path(artifacts["snapshot_meta_file"])),
        "file_manifest": _read_json(Path(artifacts["file_manifest_file"])),
        "edges": _read_json(Path(artifacts["edges_file"])),
        "feature_clusters": _read_json(Path(artifacts["feature_clusters_file"])),
        "policy_bundle": _read_json(Path(artifacts["policy_bundle_file"])),
        "slcs_context": _read_json(Path(artifacts["slcs_context_file"])),
        "architecture_summary": Path(artifacts["architecture_summary_file"]).read_text(encoding="utf-8"),
    }
    return bundle


def attach_snapshot_bundle(result: dict) -> dict | None:
    payload = result.pop("snapshot_bundle_payload", None)
    if not payload:
        return None
    record = save_snapshot_bundle(payload)
    result["snapshot_bundle"] = record
    return record


def load_build_patch_previews() -> list[dict]:
    payload = _read_json(BUILD_PATCH_PREVIEWS_PATH)
    return payload if isinstance(payload, list) else []


def save_build_patch_preview(payload: dict) -> dict:
    ensure_state_dir()
    BUILD_PATCH_PREVIEWS_DIR.mkdir(parents=True, exist_ok=True)

    preview_id = payload.get("id") or str(uuid.uuid4())
    created_at = payload.get("created_at") or _now_iso()
    preview_dir = BUILD_PATCH_PREVIEWS_DIR / preview_id
    preview_dir.mkdir(parents=True, exist_ok=True)

    artifact_paths = {
        "task_packet_file": preview_dir / "task_packet.json",
        "normalized_result_file": preview_dir / "normalized_result.json",
        "patch_bundle_file": preview_dir / "patch_bundle.json",
        "validation_report_file": preview_dir / "validation_report.json",
    }

    for key, path in artifact_paths.items():
        source_key = key.replace("_file", "")
        path.write_text(json.dumps(payload.get(source_key, {}), indent=2) + "\n", encoding="utf-8")

    record = {
        "id": preview_id,
        "created_at": created_at,
        "label": payload.get("label") or "Build patch preview",
        "bundle_dir": str(preview_dir),
        "artifacts": {key: str(value) for key, value in artifact_paths.items()},
        "ready_to_apply": bool(payload.get("ready_to_apply", False)),
        "warning_count": int(payload.get("warning_count", 0)),
        "error_count": int(payload.get("error_count", 0)),
        "copied_file_count": int(payload.get("copied_file_count", 0)),
    }

    current = load_build_patch_previews()
    next_records = [record]
    for item in current:
        if item.get("id") != preview_id:
            next_records.append(item)
    _write_json(BUILD_PATCH_PREVIEWS_PATH, next_records[:120])
    return record


def load_build_patch_preview(preview_id: str) -> dict | None:
    record = next((item for item in load_build_patch_previews() if item.get("id") == preview_id), None)
    if not record:
        return None
    artifacts = record.get("artifacts", {})
    payload = deepcopy(record)
    payload["contents"] = {
        "task_packet": _read_json(Path(artifacts["task_packet_file"])),
        "normalized_result": _read_json(Path(artifacts["normalized_result_file"])),
        "patch_bundle": _read_json(Path(artifacts["patch_bundle_file"])),
        "validation_report": _read_json(Path(artifacts["validation_report_file"])),
    }
    return payload


def load_bookmarks() -> list[dict]:
    payload = _read_json(BOOKMARKS_PATH)
    return payload if isinstance(payload, list) else []


def save_bookmarks(bookmarks: list[dict]) -> None:
    _write_json(BOOKMARKS_PATH, bookmarks)


def add_bookmark(bookmark: dict) -> dict:
    bookmarks = load_bookmarks()
    record = {
        "id": str(uuid.uuid4()),
        "created_at": _now_iso(),
        **bookmark,
    }
    bookmarks.insert(0, record)
    save_bookmarks(bookmarks[:200])
    return record


def delete_bookmark(bookmark_id: str) -> None:
    save_bookmarks([item for item in load_bookmarks() if item["id"] != bookmark_id])


def load_layout() -> dict:
    payload = _read_json(LAYOUT_PATH)
    if isinstance(payload, dict):
        return payload
    return {
        "active_tab": "vault",
        "selected_file_path": None,
        "expanded_nodes": [],
        "graph_local_depth": 0,
        "graph_source_filter": "all",
        "graph_pinned_nodes": [],
        "graph_viewport": {"x": 0, "y": 0, "scale": 1},
    }


def save_layout(layout: dict) -> None:
    _write_json(LAYOUT_PATH, layout)


def load_snapshots() -> list[dict]:
    payload = _read_json(SNAPSHOTS_PATH)
    return payload if isinstance(payload, list) else []


def append_snapshot(snapshot: dict) -> dict:
    snapshots = load_snapshots()
    record = {
        "id": str(uuid.uuid4()),
        "created_at": _now_iso(),
        **snapshot,
    }
    snapshots.insert(0, record)
    _write_json(SNAPSHOTS_PATH, snapshots[:200])
    return record


def load_canvases() -> list[dict]:
    payload = _read_json(CANVASES_PATH)
    if isinstance(payload, list):
        return payload
    return [
        {
            "id": "main-canvas",
            "name": "Main Canvas",
            "description": "Default board for linking important files and ideas.",
            "cards": [],
            "edges": [],
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        }
    ]


def save_canvases(canvases: list[dict]) -> None:
    _write_json(CANVASES_PATH, canvases)


def upsert_canvas(*, canvas_id: str | None, payload: dict) -> dict:
    canvases = load_canvases()
    now = _now_iso()
    target_id = canvas_id or str(uuid.uuid4())
    replacement = {
        "id": target_id,
        "created_at": now,
        "updated_at": now,
        **payload,
    }

    next_canvases: list[dict] = []
    found = False
    for canvas in canvases:
        if canvas["id"] == target_id:
            replacement["created_at"] = canvas.get("created_at", now)
            next_canvases.append(replacement)
            found = True
        else:
            next_canvases.append(canvas)
    if not found:
        next_canvases.append(replacement)
    save_canvases(next_canvases)
    return replacement


def delete_canvas(canvas_id: str) -> None:
    save_canvases([canvas for canvas in load_canvases() if canvas["id"] != canvas_id])


def load_workspace_config() -> dict:
    saved = _read_json(WORKSPACE_CONFIG_PATH)
    if isinstance(saved, dict):
        return saved

    examples = load_examples()
    if examples:
        return deepcopy(examples[0]["config"])

    return {
        "vault_name": "Context Vault Studio",
        "output_dir": str((REPO_ROOT / "build" / "context-vault-studio").resolve()),
        "default_mode": "copy",
        "max_file_size_bytes": 5_000_000,
        "default_exclude": [],
        "default_include": [],
        "access": {
            "allowed_roots": [],
            "blocked_paths": [],
            "blocked_patterns": [],
            "enforce_copy_mode": True,
        },
        "sources": [],
    }


def save_workspace_config(config: dict) -> None:
    _write_json(WORKSPACE_CONFIG_PATH, config)


def load_last_result() -> dict | None:
    payload = _read_json(LAST_RESULT_PATH)
    return payload if isinstance(payload, dict) else None


def save_last_result(result: dict) -> None:
    _write_json(LAST_RESULT_PATH, result)
