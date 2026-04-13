from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient


def make_client(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("CONTEXT_VAULT_STATE_DIR", str(tmp_path / "state"))
    import importlib
    import context_vault_studio.storage as storage_module
    import context_vault_studio.api.app as app_module

    importlib.reload(storage_module)
    app_module = importlib.reload(app_module)
    return TestClient(app_module.app), storage_module


def test_restore_model_state_snapshot_sets_active_model(tmp_path: Path, monkeypatch) -> None:
    client, storage_module = make_client(tmp_path, monkeypatch)

    result = {
        "config": {
            "vault_name": "Model Workflow",
            "output_dir": str(tmp_path / "output"),
            "default_mode": "copy",
            "max_file_size_bytes": 5000000,
            "default_exclude": [],
            "default_include": [],
            "access": {
                "allowed_roots": [],
                "blocked_paths": [],
                "blocked_patterns": [],
                "enforce_copy_mode": True,
            },
            "digital_brain": {
                "scan_mode": "quick_start",
                "graph_density": "balanced",
                "enrichment_mode": "background",
                "retention_mode": "extracted_text",
                "prioritize_recent_files": True,
                "include_notes": True,
                "include_chats": True,
                "priority_categories": ["conversations", "documents"],
            },
            "model_workflow": {
                "auto_snapshot_after_build": True,
                "auto_snapshot_after_refresh": True,
                "auto_snapshot_on_monitored_changes": False,
                "auto_snapshot_retention": 24,
            },
            "sources": [],
        },
        "summary": {"vault_name": "Model Workflow", "file_count": 0},
        "artifacts": {"output_dir": str(tmp_path / "output")},
    }

    snapshot = storage_module.append_model_snapshot(result=result, trigger="build", retention=24)
    response = client.post("/api/snapshots/restore", json={"snapshot_id": snapshot["id"]})
    assert response.status_code == 200
    assert response.json()["kind"] == "model_state"

    restored = storage_module.load_last_result()
    assert restored is not None
    assert restored["summary"]["vault_name"] == "Model Workflow"
