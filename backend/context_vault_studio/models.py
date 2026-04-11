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
