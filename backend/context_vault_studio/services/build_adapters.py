from __future__ import annotations

import uuid

from context_vault_studio.models import (
    AdapterCapabilities,
    BackendTaskPacket,
    BuildTaskRequest,
    NormalizedBuildResult,
    ReconciliationReport,
    ValidationReport,
)


ADAPTER_CAPABILITIES = [
    AdapterCapabilities(
        adapter_id="deterministic",
        label="Deterministic Builder",
        transport="internal",
        supports_json_output=True,
        supports_streaming=False,
        supports_tool_calls=False,
        supports_local_execution=True,
        supports_file_outputs=True,
        max_context_strategy="registry_rules",
    ),
    AdapterCapabilities(
        adapter_id="cloud_api",
        label="Cloud API Adapter",
        transport="http",
        supports_json_output=True,
        supports_streaming=True,
        supports_tool_calls=False,
        supports_local_execution=False,
        supports_file_outputs=False,
        max_context_strategy="chunked_scope",
    ),
    AdapterCapabilities(
        adapter_id="local_server",
        label="Local Server Adapter",
        transport="localhost_http",
        supports_json_output=True,
        supports_streaming=True,
        supports_tool_calls=False,
        supports_local_execution=True,
        supports_file_outputs=False,
        max_context_strategy="scoped_snapshot",
    ),
    AdapterCapabilities(
        adapter_id="local_cli",
        label="Local CLI Adapter",
        transport="subprocess",
        supports_json_output=True,
        supports_streaming=False,
        supports_tool_calls=False,
        supports_local_execution=True,
        supports_file_outputs=True,
        max_context_strategy="task_bundle",
    ),
    AdapterCapabilities(
        adapter_id="file_handshake",
        label="File Handshake Adapter",
        transport="watched_folder",
        supports_json_output=True,
        supports_streaming=False,
        supports_tool_calls=False,
        supports_local_execution=True,
        supports_file_outputs=True,
        max_context_strategy="task_bundle",
    ),
]


def list_build_adapter_capabilities() -> list[dict]:
    return [item.model_dump() for item in ADAPTER_CAPABILITIES]


def build_adapter_contract_schemas() -> dict:
    return {
        "build_task_request": BuildTaskRequest.model_json_schema(),
        "adapter_capabilities": AdapterCapabilities.model_json_schema(),
        "backend_task_packet": BackendTaskPacket.model_json_schema(),
        "normalized_build_result": NormalizedBuildResult.model_json_schema(),
        "validation_report": ValidationReport.model_json_schema(),
        "reconciliation_report": ReconciliationReport.model_json_schema(),
    }


def build_task_packet(request: BuildTaskRequest, snapshot_bundle: dict) -> dict:
    contents = snapshot_bundle.get("contents", {})
    manifest = contents.get("file_manifest") or {}
    policy_bundle = contents.get("policy_bundle") or {}
    snapshot_meta = contents.get("snapshot_meta") or {}
    files = manifest.get("files") or []

    selected_files = request.selected_files or [item.get("rel_path") for item in files[:20] if item.get("rel_path")]
    allowed_targets = request.allowed_targets or [
        item.get("path")
        for item in policy_bundle.get("sources", [])
        if item.get("path")
    ]
    forbidden_paths = request.forbidden_paths or policy_bundle.get("access", {}).get("blocked_paths", [])

    packet = BackendTaskPacket(
        request_id=f"build-task-{uuid.uuid4().hex[:8]}",
        adapter_id=request.adapter_id,
        snapshot_bundle_id=request.snapshot_bundle_id or snapshot_bundle.get("id"),
        goal=request.goal,
        scope={
            "selected_files": selected_files,
            "allowed_targets": allowed_targets,
            "forbidden_paths": forbidden_paths,
            "source_count": manifest.get("summary", {}).get("source_count", 0),
            "file_count": manifest.get("summary", {}).get("file_count", 0),
        },
        policy_bundle=policy_bundle,
        selected_slcs_pieces=request.selected_slcs_pieces,
        response_schema=request.response_schema,
        metadata={
            **request.metadata,
            "snapshot_label": snapshot_bundle.get("label"),
            "snapshot_kind": snapshot_bundle.get("kind"),
            "snapshot_generated_at": snapshot_meta.get("generated_at"),
            "slcs_status": (contents.get("slcs_context") or {}).get("status", "not_configured"),
        },
    )
    return packet.model_dump()
