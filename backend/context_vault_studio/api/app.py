from __future__ import annotations

import mimetypes
import re
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

from context_vault_studio.models import (
    BuildRequest,
    FilePreviewRequest,
    InspectPathRequest,
    JobRequest,
    PresetPayload,
    WorkspaceConfig,
)
from context_vault_studio.services.workspace_builder import (
    build_workspace_from_config,
    evaluate_path_access,
    evaluate_relative_access,
    matches_any,
    resolve_path_value,
)
from context_vault_studio.services.job_manager import create_job, get_job, list_jobs
from context_vault_studio.storage import (
    APP_DESCRIPTION,
    APP_ID,
    APP_NAME,
    REPO_ROOT,
    append_build_history,
    delete_preset,
    load_build_history,
    load_examples,
    load_last_result,
    load_presets,
    load_workspace_config,
    save_last_result,
    save_workspace_config,
    upsert_preset,
)


app = FastAPI(title=APP_NAME, version="0.1.0", description=APP_DESCRIPTION)
TEXT_PREVIEW_LIMIT = 120_000
MARKDOWN_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:12046",
        "http://localhost:12046",
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "app_id": APP_ID}


@app.get("/api/bootstrap")
def bootstrap() -> dict:
    return {
        "app": {
            "id": APP_ID,
            "name": APP_NAME,
            "description": APP_DESCRIPTION,
            "repo_root": str(REPO_ROOT),
        },
        "config": load_workspace_config(),
        "examples": load_examples(),
        "presets": load_presets(),
        "build_history": load_build_history(),
        "jobs": list_jobs()[:8],
        "last_result": load_last_result(),
    }


@app.get("/api/presets")
def list_presets() -> list[dict]:
    return load_presets()


@app.post("/api/presets")
def create_preset(payload: PresetPayload) -> dict:
    return upsert_preset(
        preset_id=None,
        name=payload.name,
        description=payload.description,
        config=payload.config.model_dump(),
    )


@app.put("/api/presets/{preset_id}")
def update_preset(preset_id: str, payload: PresetPayload) -> dict:
    return upsert_preset(
        preset_id=preset_id,
        name=payload.name,
        description=payload.description,
        config=payload.config.model_dump(),
    )


@app.delete("/api/presets/{preset_id}")
def remove_preset(preset_id: str) -> dict:
    delete_preset(preset_id)
    return {"status": "ok", "id": preset_id}


@app.get("/api/build-history")
def build_history() -> list[dict]:
    return load_build_history()


@app.get("/api/jobs")
def jobs() -> list[dict]:
    return list_jobs()


@app.get("/api/jobs/{job_id}")
def job(job_id: str) -> dict:
    payload = get_job(job_id)
    if not payload:
        raise HTTPException(status_code=404, detail="Job not found")
    return payload


@app.post("/api/jobs")
def enqueue_job(payload: JobRequest) -> dict:
    return create_job(kind=payload.kind, config=payload.config.model_dump(), clean=payload.clean)


@app.put("/api/workspace-config")
def update_workspace_config(config: WorkspaceConfig) -> dict:
    payload = config.model_dump()
    save_workspace_config(payload)
    return payload


@app.post("/api/preview")
def preview_workspace(request: BuildRequest) -> dict:
    payload = request.config.model_dump()
    try:
        result = build_workspace_from_config(
            payload,
            base_dir=REPO_ROOT,
            dry_run=True,
            clean=request.clean,
        )
    except (FileNotFoundError, NotADirectoryError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    save_workspace_config(result["config"])
    return result


@app.post("/api/build")
def build_workspace(request: BuildRequest) -> dict:
    payload = request.config.model_dump()
    try:
        result = build_workspace_from_config(
            payload,
            base_dir=REPO_ROOT,
            dry_run=False,
            clean=request.clean,
        )
    except (FileNotFoundError, NotADirectoryError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    save_workspace_config(result["config"])
    save_last_result(result)
    append_build_history(
        {
            "id": result["summary"]["generated_at"],
            "created_at": result["summary"]["generated_at"],
            "summary": result["summary"],
            "artifacts": result["artifacts"],
            "config": result["config"],
        }
    )
    return result


def _current_access_policy(explicit_access: dict | None = None) -> dict:
    if explicit_access is not None:
        return explicit_access
    return load_workspace_config().get("access", {})


def _path_allowed_for_app(path: Path, access: dict) -> tuple[bool, str]:
    resolved = path.expanduser().resolve()
    last_result = load_last_result() or {}
    output_dir = (
        Path(last_result.get("artifacts", {}).get("output_dir")).expanduser().resolve()
        if last_result.get("artifacts", {}).get("output_dir")
        else None
    )
    if output_dir and output_dir.exists():
        try:
            resolved.relative_to(output_dir)
            return True, ""
        except ValueError:
            pass

    accessible, reason = evaluate_path_access(resolved, access)
    if not accessible:
        return False, reason

    blocked_patterns = access.get("blocked_patterns", [])
    rel_posix = resolved.as_posix().lstrip("/")
    if blocked_patterns and matches_any(rel_posix, resolved.name, blocked_patterns, mode="exclude"):
        return False, f"Blocked by pattern: {resolved.name}"
    return True, ""


def _file_kind(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in {".md", ".txt", ".json", ".py", ".js", ".ts", ".tsx", ".yaml", ".yml", ".toml", ".css", ".html"}:
        return "text"
    if suffix in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".avif"}:
        return "image"
    if suffix == ".pdf":
        return "pdf"
    return "binary"


@app.post("/api/file-preview")
def file_preview(payload: FilePreviewRequest) -> dict:
    access = _current_access_policy(payload.access.model_dump() if payload.access else None)
    resolved = Path(resolve_path_value(payload.path, base_dir=REPO_ROOT)).resolve()
    accessible, reason = _path_allowed_for_app(resolved, access)
    if not accessible:
        raise HTTPException(status_code=403, detail=reason or "File is not accessible")
    if not resolved.exists() or not resolved.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    kind = _file_kind(resolved)
    preview = {
        "path": str(resolved),
        "name": resolved.name,
        "kind": kind,
        "size_bytes": resolved.stat().st_size,
        "mime_type": mimetypes.guess_type(str(resolved))[0] or "application/octet-stream",
        "content": None,
        "headings": [],
        "media_url": f"/api/file-content?path={resolved.as_posix()}",
    }

    if kind == "text":
        content = resolved.read_text(encoding="utf-8", errors="replace")
        if len(content) > TEXT_PREVIEW_LIMIT:
            content = content[:TEXT_PREVIEW_LIMIT] + "\n\n[truncated]"
        preview["content"] = content
        preview["headings"] = [
            {"level": len(match.group(1)), "text": match.group(2).strip()}
            for match in MARKDOWN_HEADING_RE.finditer(content)
        ]

    return preview


@app.get("/api/file-content")
def file_content(path: str) -> FileResponse:
    access = _current_access_policy()
    resolved = Path(resolve_path_value(path, base_dir=REPO_ROOT)).resolve()
    accessible, reason = _path_allowed_for_app(resolved, access)
    if not accessible:
        raise HTTPException(status_code=403, detail=reason or "File is not accessible")
    if not resolved.exists() or not resolved.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(resolved)


@app.post("/api/path-inspect")
def inspect_path(request: InspectPathRequest) -> dict:
    resolved = Path(resolve_path_value(request.path, base_dir=REPO_ROOT)).resolve()
    access = request.access.model_dump() if request.access else load_workspace_config().get("access", {})
    accessible, access_reason = evaluate_path_access(resolved, access)
    exists = resolved.exists()
    is_dir = resolved.is_dir()
    children: list[dict] = []
    blocked_child_count = 0

    if exists and is_dir and accessible:
        for child in sorted(resolved.iterdir(), key=lambda item: (item.is_file(), item.name.lower()))[:40]:
            child_accessible, _reason = evaluate_path_access(child.resolve(), access)
            if child_accessible:
                relative_name = child.relative_to(resolved).as_posix()
                child_accessible, _reason = evaluate_relative_access(relative_name, child.name, access)
            if not child_accessible:
                blocked_child_count += 1
                continue
            children.append(
                {
                    "name": child.name,
                    "kind": "directory" if child.is_dir() else "file",
                    "path": str(child),
                    "accessible": True,
                }
            )

    return {
        "input_path": request.path,
        "resolved_path": str(resolved),
        "exists": exists,
        "is_dir": is_dir,
        "accessible": accessible,
        "access_reason": access_reason,
        "blocked_child_count": blocked_child_count,
        "children": children,
    }
