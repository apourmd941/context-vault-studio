from __future__ import annotations

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
