from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


DEFAULT_EXCLUDE = [
    ".DS_Store",
    ".git/**",
    ".idea/**",
    ".next/**",
    ".pytest_cache/**",
    ".ruff_cache/**",
    ".venv/**",
    ".vscode/**",
    "__pycache__/**",
    "build/**",
    "coverage/**",
    "dist/**",
    "node_modules/**",
    "*.pyc",
    "*.pyo",
    "*.tsbuildinfo",
]


class SourceConfig(BaseModel):
    name: str = Field(..., min_length=1)
    category: str = "Projects"
    path: str = Field(..., min_length=1)
    include: list[str] = Field(default_factory=list)
    exclude: list[str] = Field(default_factory=list)
    mode: Literal["copy", "symlink"] | None = None
    max_file_size_bytes: int | None = Field(default=None, ge=1)


class AccessPolicy(BaseModel):
    allowed_roots: list[str] = Field(default_factory=list)
    blocked_paths: list[str] = Field(default_factory=list)
    blocked_patterns: list[str] = Field(default_factory=list)
    enforce_copy_mode: bool = True


class WorkspaceConfig(BaseModel):
    vault_name: str = "Context Vault Studio"
    output_dir: str = "./build/context-vault-studio"
    default_mode: Literal["copy", "symlink"] = "copy"
    max_file_size_bytes: int = Field(default=5_000_000, ge=1)
    default_exclude: list[str] = Field(default_factory=lambda: list(DEFAULT_EXCLUDE))
    default_include: list[str] = Field(default_factory=list)
    access: AccessPolicy = Field(default_factory=AccessPolicy)
    sources: list[SourceConfig] = Field(default_factory=list)


class BuildRequest(BaseModel):
    config: WorkspaceConfig
    clean: bool = True


class JobRequest(BaseModel):
    kind: Literal["preview", "build"]
    config: WorkspaceConfig
    clean: bool = True


class PresetPayload(BaseModel):
    name: str = Field(..., min_length=1)
    description: str = ""
    config: WorkspaceConfig


class BookmarkPayload(BaseModel):
    type: Literal["file", "query", "graph", "canvas"] = "file"
    label: str = Field(..., min_length=1)
    path: str | None = None
    file_id: str | None = None
    query: str | None = None


class LayoutPayload(BaseModel):
    active_tab: str = "vault"
    selected_file_path: str | None = None
    expanded_nodes: list[str] = Field(default_factory=list)
    graph_local_depth: int = 0
    graph_source_filter: str = "all"
    graph_pinned_nodes: list[str] = Field(default_factory=list)
    graph_viewport: dict = Field(default_factory=lambda: {"x": 0, "y": 0, "scale": 1})


class SnapshotRestorePayload(BaseModel):
    snapshot_id: str = Field(..., min_length=1)


class FileSaveRequest(BaseModel):
    path: str = Field(..., min_length=1)
    content: str = ""
    access: AccessPolicy | None = None


class FileCreateRequest(BaseModel):
    directory: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    content: str = ""
    access: AccessPolicy | None = None


class CanvasCard(BaseModel):
    id: str
    type: Literal["file", "text"] = "file"
    label: str
    path: str | None = None
    file_id: str | None = None
    text: str = ""
    x: float = 0
    y: float = 0
    width: float = 280
    height: float = 180
    color: str = "violet"


class CanvasEdge(BaseModel):
    id: str
    from_card: str
    to_card: str
    label: str = ""


class CanvasPayload(BaseModel):
    name: str = Field(..., min_length=1)
    description: str = ""
    cards: list[CanvasCard] = Field(default_factory=list)
    edges: list[CanvasEdge] = Field(default_factory=list)


class InspectPathRequest(BaseModel):
    path: str = Field(..., min_length=1)
    access: AccessPolicy | None = None


class FilePreviewRequest(BaseModel):
    path: str = Field(..., min_length=1)
    access: AccessPolicy | None = None


class BuildTaskRequest(BaseModel):
    goal: str = Field(..., min_length=1)
    snapshot_bundle_id: str | None = None
    selected_files: list[str] = Field(default_factory=list)
    allowed_targets: list[str] = Field(default_factory=list)
    forbidden_paths: list[str] = Field(default_factory=list)
    selected_slcs_pieces: list[str] = Field(default_factory=list)
    adapter_id: str = "deterministic"
    response_schema: str = "plan_json"
    metadata: dict = Field(default_factory=dict)


class ParallelScanRequest(BaseModel):
    config: WorkspaceConfig
    max_workers: int = Field(default=4, ge=1, le=16)


class DeltaSnapshotRequest(BaseModel):
    config: WorkspaceConfig
    previous_snapshot_bundle_id: str = Field(..., min_length=1)


class AdapterCapabilities(BaseModel):
    adapter_id: str = Field(..., min_length=1)
    label: str = Field(..., min_length=1)
    transport: str = Field(..., min_length=1)
    supports_json_output: bool = True
    supports_streaming: bool = False
    supports_tool_calls: bool = False
    supports_local_execution: bool = False
    supports_file_outputs: bool = False
    max_context_strategy: str = "scoped_snapshot"


class BackendTaskPacket(BaseModel):
    request_id: str = Field(..., min_length=1)
    adapter_id: str = Field(..., min_length=1)
    snapshot_bundle_id: str | None = None
    goal: str = Field(..., min_length=1)
    scope: dict = Field(default_factory=dict)
    policy_bundle: dict = Field(default_factory=dict)
    selected_slcs_pieces: list[str] = Field(default_factory=list)
    response_schema: str = "plan_json"
    metadata: dict = Field(default_factory=dict)


class ValidationFinding(BaseModel):
    severity: Literal["info", "warning", "error"] = "info"
    code: str = Field(..., min_length=1)
    message: str = Field(..., min_length=1)


class ValidationReport(BaseModel):
    status: Literal["pass", "warning", "fail"] = "pass"
    findings: list[ValidationFinding] = Field(default_factory=list)


class ReconciliationReport(BaseModel):
    summary: str = ""
    before_snapshot_id: str | None = None
    after_snapshot_id: str | None = None
    changed_files: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class NormalizedBuildResult(BaseModel):
    request_id: str = Field(..., min_length=1)
    adapter_id: str = Field(..., min_length=1)
    status: Literal["ok", "needs_revision", "error"] = "ok"
    plan: dict = Field(default_factory=dict)
    file_actions: list[dict] = Field(default_factory=list)
    patches: list[dict] = Field(default_factory=list)
    artifacts: dict = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    raw_output_ref: str | None = None
    validation: ValidationReport = Field(default_factory=ValidationReport)
    reconciliation: ReconciliationReport | None = None
