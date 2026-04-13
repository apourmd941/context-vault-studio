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
    return TestClient(app_module.app)


def test_preview_builds_digital_brain_index(tmp_path: Path, monkeypatch) -> None:
    source_dir = tmp_path / "docs"
    source_dir.mkdir()
    (source_dir / "README.md").write_text("# Brain\n\nDecision note.\n", encoding="utf-8")

    client = make_client(tmp_path, monkeypatch)
    payload = {
        "config": {
            "vault_name": "Brain Test",
            "output_dir": str(tmp_path / "output"),
            "default_mode": "copy",
            "max_file_size_bytes": 5000000,
            "default_exclude": [],
            "default_include": [],
            "access": {
                "allowed_roots": [str(source_dir)],
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
                "priority_categories": ["conversations", "documents", "memories"],
            },
            "sources": [
                {
                    "name": "docs",
                    "category": "Docs",
                    "path": str(source_dir),
                    "include": ["*.md"],
                    "exclude": [],
                }
            ],
        },
        "clean": True,
        "worker_profile": "default",
    }

    preview = client.post("/api/preview", json=payload)
    assert preview.status_code == 200
    preview_json = preview.json()
    assert preview_json["digital_brain_index"]["source_object_count"] == 1

    bootstrap = client.get("/api/bootstrap")
    assert bootstrap.status_code == 200
    bootstrap_json = bootstrap.json()
    assert bootstrap_json["digital_brain_indexes"]
    assert bootstrap_json["digital_brain_adapter_contracts"]

    index_id = bootstrap_json["digital_brain_indexes"][0]["id"]
    detail = client.get(f"/api/digital-brain/indexes/{index_id}")
    assert detail.status_code == 200
    detail_json = detail.json()
    assert detail_json["contents"]["summary"]["source_object_count"] == 1
    assert detail_json["contents"]["source_registry"]
    assert detail_json["contents"]["focus_graph"]["nodes"]
