from __future__ import annotations


def build_history_timeline(
    *,
    snapshot_bundles: list[dict],
    snapshots: list[dict],
    delta_snapshots: list[dict],
    patch_previews: list[dict],
    apply_runs: list[dict],
    logic_profiles: list[dict],
    explain_bundles: list[dict],
    canvas_scopes: list[dict],
) -> list[dict]:
    timeline: list[dict] = []

    for item in snapshot_bundles:
        timeline.append(
            {
                "kind": "snapshot_bundle",
                "id": item["id"],
                "created_at": item["created_at"],
                "label": item["label"],
                "summary": {
                    "file_count": item.get("file_count", 0),
                    "edge_count": item.get("edge_count", 0),
                },
            }
        )

    for item in snapshots:
        if item.get("kind") != "canvas_state":
            continue
        timeline.append(
            {
                "kind": "canvas_state",
                "id": item["id"],
                "created_at": item["created_at"],
                "label": item.get("label") or "Canvas state",
                "summary": {
                    "canvas_id": item.get("content", {}).get("canvas", {}).get("id"),
                    "snapshot_bundle_id": item.get("snapshot_bundle_id"),
                },
            }
        )

    for item in delta_snapshots:
        timeline.append(
            {
                "kind": "delta_snapshot",
                "id": item["id"],
                "created_at": item["created_at"],
                "label": item["label"],
                "summary": {
                    "changed_count": item.get("changed_count", 0),
                    "added_count": item.get("added_count", 0),
                    "removed_count": item.get("removed_count", 0),
                },
            }
        )

    for item in patch_previews:
        timeline.append(
            {
                "kind": "patch_preview",
                "id": item["id"],
                "created_at": item["created_at"],
                "label": item["label"],
                "summary": {
                    "ready_to_apply": item.get("ready_to_apply", False),
                    "warning_count": item.get("warning_count", 0),
                    "error_count": item.get("error_count", 0),
                    "canvas_id": item.get("canvas_id"),
                    "canvas_label": item.get("canvas_label"),
                    "scope_label": item.get("scope_label"),
                    "selected_file_count": item.get("selected_file_count", 0),
                },
            }
        )

    for item in apply_runs:
        timeline.append(
            {
                "kind": "apply_run",
                "id": item["id"],
                "created_at": item["created_at"],
                "label": item["label"],
                "summary": {
                    "preview_id": item.get("preview_id"),
                    "canvas_id": item.get("canvas_id"),
                    "canvas_label": item.get("canvas_label"),
                    "scope_label": item.get("scope_label"),
                    "selected_file_count": item.get("selected_file_count", 0),
                },
            }
        )

    for item in logic_profiles:
        timeline.append(
            {
                "kind": "logic_profile",
                "id": item["id"],
                "created_at": item["created_at"],
                "label": item["label"],
                "summary": {
                    "file_count": item.get("file_count", 0),
                    "import_count": item.get("import_count", 0),
                    "symbol_count": item.get("symbol_count", 0),
                },
            }
        )

    for item in explain_bundles:
        timeline.append(
            {
                "kind": "explain_bundle",
                "id": item["id"],
                "created_at": item["created_at"],
                "label": item["label"],
                "summary": {
                    "top_file_count": item.get("top_file_count", 0),
                    "top_symbol_count": item.get("top_symbol_count", 0),
                },
            }
        )

    for item in canvas_scopes:
        metadata = item.get("metadata") or {}
        timeline.append(
            {
                "kind": "canvas_scope",
                "id": item["id"],
                "created_at": item["created_at"],
                "label": item["label"],
                "summary": {
                    "selected_file_count": len(metadata.get("selected_files", [])),
                    "canvas_id": metadata.get("canvas_id"),
                    "snapshot_bundle_id": metadata.get("snapshot_bundle_id"),
                },
            }
        )

    timeline.sort(key=lambda item: item["created_at"], reverse=True)
    return timeline


def compare_snapshot_bundles(left: dict, right: dict) -> dict:
    left_contents = left.get("contents") or {}
    right_contents = right.get("contents") or {}
    left_manifest = left_contents.get("file_manifest") or {}
    right_manifest = right_contents.get("file_manifest") or {}

    left_files = {
        item["rel_path"]: item.get("content_hash")
        for item in left_manifest.get("files", [])
        if item.get("rel_path")
    }
    right_files = {
        item["rel_path"]: item.get("content_hash")
        for item in right_manifest.get("files", [])
        if item.get("rel_path")
    }

    added = sorted(path for path in right_files if path not in left_files)
    removed = sorted(path for path in left_files if path not in right_files)
    changed = sorted(path for path in right_files if path in left_files and right_files[path] != left_files[path])

    return {
        "left_snapshot_bundle_id": left.get("id"),
        "right_snapshot_bundle_id": right.get("id"),
        "summary": {
            "left_file_count": len(left_files),
            "right_file_count": len(right_files),
            "added_count": len(added),
            "removed_count": len(removed),
            "changed_count": len(changed),
        },
        "added_files": added,
        "removed_files": removed,
        "changed_files": changed,
    }
