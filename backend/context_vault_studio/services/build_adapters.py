from __future__ import annotations

import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

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


def _capability_by_id(adapter_id: str) -> AdapterCapabilities:
    for item in ADAPTER_CAPABILITIES:
        if item.adapter_id == adapter_id:
            return item
    raise KeyError(adapter_id)


def build_adapter_contract_schemas() -> dict:
    return {
        "build_task_request": BuildTaskRequest.model_json_schema(),
        "adapter_capabilities": AdapterCapabilities.model_json_schema(),
        "backend_task_packet": BackendTaskPacket.model_json_schema(),
        "normalized_build_result": NormalizedBuildResult.model_json_schema(),
        "validation_report": ValidationReport.model_json_schema(),
        "reconciliation_report": ReconciliationReport.model_json_schema(),
    }


def build_task_packet(request: BuildTaskRequest, snapshot_bundle: dict, explain_bundle: dict | None = None) -> dict:
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
            "explain_bundle_id": explain_bundle.get("id") if explain_bundle else None,
            "explain_summary": (explain_bundle.get("contents") or {}).get("summary") if explain_bundle else None,
        },
    )
    return packet.model_dump()


class BuildAdapter(Protocol):
    adapter_id: str

    def capabilities(self) -> AdapterCapabilities: ...

    def run(self, packet: dict, snapshot_bundle: dict) -> dict: ...


@dataclass
class _BaseAdapter:
    adapter_id: str

    def capabilities(self) -> AdapterCapabilities:
        return _capability_by_id(self.adapter_id)

    def run(self, packet: dict, snapshot_bundle: dict) -> dict:
        raise NotImplementedError


class InformationalAdapter(_BaseAdapter):
    def run(self, packet: dict, snapshot_bundle: dict) -> dict:
        capability = self.capabilities()
        return NormalizedBuildResult(
            request_id=packet["request_id"],
            adapter_id=self.adapter_id,
            status="needs_revision",
            plan={
                "summary": f"{capability.label} is declared and discoverable, but not configured yet in this repo.",
                "steps": [
                    "Keep using the formal task packet contract.",
                    f"Attach a real {capability.transport} transport when this backend is introduced.",
                    "Validate outputs through the same normalized result gate.",
                ],
            },
            file_actions=[],
            patches=[],
            warnings=[
                f"{capability.label} is currently a stub adapter.",
                f"Snapshot bundle {snapshot_bundle.get('id')} was preserved as the governed source of truth.",
            ],
            raw_output_ref=f"adapter://{self.adapter_id}/not-configured",
            validation=ValidationReport(
                status="warning",
                findings=[
                    {
                        "severity": "warning",
                        "code": "adapter_not_configured",
                        "message": f"{capability.label} is not configured in this local app yet.",
                    }
                ],
            ),
        ).model_dump()


def _slugify_piece(value: str) -> str:
    cleaned = "".join(ch.lower() if ch.isalnum() else "-" for ch in value).strip("-")
    while "--" in cleaned:
        cleaned = cleaned.replace("--", "-")
    return cleaned or "piece"


def _suggest_extension(piece_name: str, selected_files: list[str]) -> str:
    lowered = piece_name.lower()
    if "route" in lowered or "service" in lowered or "validator" in lowered:
        return ".py"
    if "component" in lowered or "ui" in lowered:
        return ".tsx"
    if "config" in lowered:
        return ".json"
    if selected_files:
        extension = Path(selected_files[0]).suffix
        if extension:
            return extension
    return ".md"


class DeterministicAdapter(_BaseAdapter):
    def run(self, packet: dict, snapshot_bundle: dict) -> dict:
        scope = packet.get("scope", {})
        policy_bundle = packet.get("policy_bundle", {})
        selected_files = scope.get("selected_files", [])
        allowed_targets = scope.get("allowed_targets", [])
        selected_pieces = packet.get("selected_slcs_pieces", [])
        chosen_target = allowed_targets[0] if allowed_targets else "generated/"

        file_actions: list[dict] = []
        patches: list[dict] = []
        manifest_entries: list[dict] = []
        steps: list[str] = []
        findings: list[dict] = []
        warnings: list[str] = []

        if not selected_pieces:
            findings.append(
                {
                    "severity": "warning",
                    "code": "no_selected_pieces",
                    "message": "No SLCS pieces were selected, so the deterministic plan is a scoped review only.",
                }
            )
            warnings.append("No SLCS pieces were selected; generated output is intentionally minimal.")

        for piece_name in selected_pieces or ["scoped_review_piece"]:
            piece_slug = _slugify_piece(piece_name.replace("_piece", ""))
            extension = _suggest_extension(piece_name, selected_files)
            proposed_path = str(Path(chosen_target) / f"{piece_slug}{extension}")
            action = "modify" if selected_files else "create"
            target_path = selected_files[0] if action == "modify" else proposed_path

            steps.append(f"Use `{piece_name}` to produce a deterministic scoped change for `{target_path}`.")
            file_actions.append(
                {
                    "action": action,
                    "path": target_path,
                    "piece": piece_name,
                    "reason": packet.get("goal"),
                }
            )
            patches.append(
                {
                    "path": target_path,
                    "piece": piece_name,
                    "preview": f"Deterministic template for {piece_name} based on goal: {packet.get('goal')}",
                }
            )
            manifest_entries.append(
                {
                    "piece": piece_name,
                    "target_path": target_path,
                    "action": action,
                }
            )

        if not allowed_targets:
            findings.append(
                {
                    "severity": "warning",
                    "code": "no_allowed_targets",
                    "message": "No explicit allowed target paths were supplied; the deterministic plan used a generated placeholder location.",
                }
            )
            warnings.append("Allowed targets were empty, so placeholder generated paths were used.")

        validation_status = "warning" if findings else "pass"

        return NormalizedBuildResult(
            request_id=packet["request_id"],
            adapter_id=self.adapter_id,
            status="ok",
            plan={
                "summary": f"Deterministic no-model build plan for {len(manifest_entries)} planned action(s).",
                "steps": steps or ["Review the scoped snapshot bundle before applying changes."],
                "goal": packet.get("goal"),
                "selected_piece_count": len(selected_pieces),
                "scope_summary": {
                    "file_count": scope.get("file_count", 0),
                    "source_count": scope.get("source_count", 0),
                },
            },
            file_actions=file_actions,
            patches=patches,
            artifacts={
                "deterministic_manifest": {
                    "request_id": packet["request_id"],
                    "selected_pieces": selected_pieces,
                    "entries": manifest_entries,
                    "policy_bundle": policy_bundle,
                }
            },
            warnings=warnings,
            raw_output_ref=f"adapter://{self.adapter_id}/deterministic-manifest/{packet['request_id']}",
            validation=ValidationReport(
                status=validation_status,
                findings=findings,
            ),
        ).model_dump()


ADAPTERS: dict[str, BuildAdapter] = {
    "deterministic": DeterministicAdapter(adapter_id="deterministic"),
    "cloud_api": InformationalAdapter(adapter_id="cloud_api"),
    "local_server": InformationalAdapter(adapter_id="local_server"),
    "local_cli": InformationalAdapter(adapter_id="local_cli"),
    "file_handshake": InformationalAdapter(adapter_id="file_handshake"),
}


def run_build_adapter(request: BuildTaskRequest, snapshot_bundle: dict, explain_bundle: dict | None = None) -> dict:
    packet = build_task_packet(request, snapshot_bundle, explain_bundle)
    adapter = ADAPTERS.get(request.adapter_id)
    if adapter is None:
        raise ValueError(f"Unknown adapter: {request.adapter_id}")
    return {
        "task_packet": packet,
        "adapter_capabilities": adapter.capabilities().model_dump(),
        "normalized_result": adapter.run(packet, snapshot_bundle),
    }
