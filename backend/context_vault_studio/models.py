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


class InspectPathRequest(BaseModel):
    path: str = Field(..., min_length=1)
    access: AccessPolicy | None = None


class FilePreviewRequest(BaseModel):
    path: str = Field(..., min_length=1)
    access: AccessPolicy | None = None
