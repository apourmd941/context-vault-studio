from __future__ import annotations

import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

from context_vault_studio.services.workspace_builder import build_workspace_from_config
from context_vault_studio.services.digital_brain import build_digital_brain_index_payload
from context_vault_studio.storage import (
    REPO_ROOT,
    attach_digital_brain_index,
    attach_snapshot_bundle,
    append_build_history,
    save_last_result,
    save_workspace_config,
)


_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="context-vault-job")
_lock = threading.Lock()
_jobs: dict[str, dict] = {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def list_jobs() -> list[dict]:
    with _lock:
        return sorted((deepcopy(job) for job in _jobs.values()), key=lambda item: item["created_at"], reverse=True)


def get_job(job_id: str) -> dict | None:
    with _lock:
        job = _jobs.get(job_id)
        return deepcopy(job) if job else None


def create_job(*, kind: str, config: dict, clean: bool, worker_profile: str = "default") -> dict:
    job_id = str(uuid.uuid4())
    now = _now_iso()
    job = {
        "id": job_id,
        "kind": kind,
        "status": "queued",
        "progress": 0,
        "message": "Queued",
        "worker_profile": worker_profile,
        "telemetry": {
            "reserved_budget": 0,
            "budget_cap": 0,
            "active_processes": 0,
            "active_threads": 0,
            "current_stage": "queued",
        },
        "created_at": now,
        "updated_at": now,
        "result": None,
        "error": None,
    }
    with _lock:
        _jobs[job_id] = job
    _executor.submit(_run_job, job_id, kind, deepcopy(config), clean, worker_profile)
    return deepcopy(job)


def _update_job(job_id: str, **patch: object) -> None:
    with _lock:
        job = _jobs[job_id]
        job.update(patch)
        job["updated_at"] = _now_iso()


def _run_job(job_id: str, kind: str, config: dict, clean: bool, worker_profile: str) -> None:
    def progress_callback(progress: dict) -> None:
        _update_job(
            job_id,
            status="running",
            progress=int(progress.get("progress", 0)),
            message=str(progress.get("message", "Working")),
            telemetry=progress.get("telemetry") or {
                "reserved_budget": 0,
                "budget_cap": 0,
                "active_processes": 0,
                "active_threads": 0,
                "current_stage": "running",
            },
        )

    try:
        progress_callback({"progress": 4, "message": f"Starting {kind}"})
        result = build_workspace_from_config(
            config,
            base_dir=Path(REPO_ROOT),
            dry_run=(kind == "preview"),
            clean=clean,
            worker_profile=worker_profile,
            progress_callback=progress_callback,
        )
        attach_snapshot_bundle(result)
        result["digital_brain_index_payload"] = build_digital_brain_index_payload(result["config"], result)
        attach_digital_brain_index(result)
        save_workspace_config(result["config"])
        if kind == "build":
            save_last_result(result)
            append_build_history(
                {
                    "id": str(uuid.uuid4()),
                    "created_at": _now_iso(),
                    "summary": result["summary"],
                    "artifacts": result["artifacts"],
                    "snapshot_bundle": result.get("snapshot_bundle"),
                    "config": result["config"],
                }
            )
        _update_job(
            job_id,
            status="completed",
            progress=100,
            message=f"{kind.title()} complete",
            telemetry={
                "reserved_budget": 0,
                "budget_cap": 0,
                "active_processes": 0,
                "active_threads": 0,
                "current_stage": "completed",
            },
            result=result,
        )
    except Exception as exc:
        _update_job(
            job_id,
            status="failed",
            progress=100,
            message="Job failed",
            telemetry={
                "reserved_budget": 0,
                "budget_cap": 0,
                "active_processes": 0,
                "active_threads": 0,
                "current_stage": "failed",
            },
            error=str(exc),
        )
