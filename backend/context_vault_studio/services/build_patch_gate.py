from __future__ import annotations

import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path

from context_vault_studio.storage import BUILD_PATCH_PREVIEWS_DIR, save_build_patch_preview


CODE_EXTENSIONS = {".py", ".js", ".jsx", ".ts", ".tsx", ".go", ".java", ".rb", ".rs"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def _path_within(candidate: Path, root: Path) -> bool:
    try:
        candidate.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def _validate_file_actions(task_packet: dict, normalized_result: dict) -> dict:
    scope = task_packet.get("scope", {})
    selected_files = {item for item in scope.get("selected_files", []) if item}
    allowed_targets = [Path(item).resolve() for item in scope.get("allowed_targets", []) if item]
    forbidden_paths = [Path(item).resolve() for item in scope.get("forbidden_paths", []) if item]
    findings: list[dict] = []

    for action in normalized_result.get("file_actions", []):
        path_value = action.get("path", "")
        candidate = Path(path_value)
        resolved = candidate.expanduser().resolve() if candidate.is_absolute() else candidate
        action_type = action.get("action")

        if action_type == "modify":
            allowed = path_value in selected_files or str(resolved) in selected_files
            if not allowed:
                findings.append(
                    {
                        "severity": "error",
                        "code": "modify_outside_selected_scope",
                        "message": f"Modify action targets `{path_value}`, which is outside the selected file scope.",
                    }
                )
        elif action_type == "create":
            if allowed_targets:
                allowed = any(_path_within(resolved, root) for root in allowed_targets if resolved.is_absolute())
                if not resolved.is_absolute():
                    allowed = True
                if not allowed:
                    findings.append(
                        {
                            "severity": "error",
                            "code": "create_outside_allowed_targets",
                            "message": f"Create action targets `{path_value}`, which is outside allowed targets.",
                        }
                    )

        for blocked in forbidden_paths:
            if resolved.is_absolute() and _path_within(resolved, blocked):
                findings.append(
                    {
                        "severity": "error",
                        "code": "path_hits_forbidden_scope",
                        "message": f"Action path `{path_value}` enters forbidden path `{blocked}`.",
                    }
                )

        if Path(path_value).suffix.lower() in CODE_EXTENSIONS:
            findings.append(
                {
                    "severity": "warning",
                    "code": "dependency_check_deferred",
                    "message": f"Code target `{path_value}` will need dependency/import validation once real patches exist.",
                }
            )

    status = "pass"
    if any(item["severity"] == "error" for item in findings):
        status = "fail"
    elif findings:
        status = "warning"

    return {"status": status, "findings": findings}


def _materialize_selected_files(preview_dir: Path, snapshot_bundle: dict, task_packet: dict) -> int:
    selected = {item for item in task_packet.get("scope", {}).get("selected_files", []) if item}
    manifest = (snapshot_bundle.get("contents") or {}).get("file_manifest") or {}
    files = manifest.get("files", [])
    inputs_dir = preview_dir / "inputs"
    copied = 0

    for record in files:
        rel_path = record.get("rel_path")
        original_path = record.get("original_path")
        if not rel_path or not original_path or rel_path not in selected:
            continue
        source_path = Path(original_path)
        if not source_path.exists() or not source_path.is_file():
            continue
        destination = inputs_dir / rel_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_path, destination)
        copied += 1

    return copied


def create_build_patch_preview(snapshot_bundle: dict, adapter_run: dict) -> dict:
    preview_id = f"patch-preview-{uuid.uuid4().hex[:8]}"
    preview_dir = BUILD_PATCH_PREVIEWS_DIR / preview_id
    preview_dir.mkdir(parents=True, exist_ok=True)

    task_packet = adapter_run.get("task_packet", {})
    normalized_result = adapter_run.get("normalized_result", {})
    validation_report = _validate_file_actions(task_packet, normalized_result)
    copied_file_count = _materialize_selected_files(preview_dir, snapshot_bundle, task_packet)

    patch_bundle = {
        "request_id": task_packet.get("request_id"),
        "adapter_id": normalized_result.get("adapter_id"),
        "goal": task_packet.get("goal"),
        "file_actions": normalized_result.get("file_actions", []),
        "patches": normalized_result.get("patches", []),
        "artifacts": normalized_result.get("artifacts", {}),
    }

    preview_payload = {
        "id": preview_id,
        "created_at": _now_iso(),
        "label": f"Patch preview for {task_packet.get('request_id', 'build-task')}",
        "task_packet": task_packet,
        "normalized_result": normalized_result,
        "patch_bundle": patch_bundle,
        "validation_report": validation_report,
        "ready_to_apply": validation_report["status"] == "pass",
        "warning_count": sum(1 for item in validation_report["findings"] if item["severity"] == "warning"),
        "error_count": sum(1 for item in validation_report["findings"] if item["severity"] == "error"),
        "copied_file_count": copied_file_count,
    }
    record = save_build_patch_preview(preview_payload)
    return record
