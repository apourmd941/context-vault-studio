from __future__ import annotations

import json
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


def test_native_dialog_endpoint_can_be_mocked(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("CONTEXT_VAULT_STATE_DIR", str(tmp_path / "state"))
    import context_vault_studio.api.app as app_module

    monkeypatch.setattr(app_module, "_run_native_path_dialog", lambda kind: str(tmp_path / ("chosen" if kind == "directory" else "file.txt")))
    client = TestClient(app_module.app)

    response = client.post("/api/native-dialog/path", json={"kind": "directory"})
    assert response.status_code == 200
    assert response.json()["path"].endswith("chosen")


def test_preview_and_build_round_trip(tmp_path: Path, monkeypatch) -> None:
    source_dir = tmp_path / "docs"
    source_dir.mkdir()
    (source_dir / "README.md").write_text("# Demo Vault\n\nA top note.\n", encoding="utf-8")
    (source_dir / "SPEC.md").write_text("[[README]]\n", encoding="utf-8")

    client = make_client(tmp_path, monkeypatch)
    payload = {
        "config": {
            "vault_name": "Demo Vault",
            "output_dir": str(tmp_path / "output"),
            "default_mode": "copy",
            "max_file_size_bytes": 5000000,
            "default_exclude": [],
            "default_include": [],
            "sources": [
                {
                    "name": "demo-docs",
                    "category": "Docs",
                    "path": str(source_dir),
                    "include": ["*.md"],
                    "exclude": [],
                }
            ],
        },
        "clean": True,
    }

    preview = client.post("/api/preview", json=payload)
    assert preview.status_code == 200
    preview_json = preview.json()
    assert preview_json["summary"]["file_count"] == 2
    assert preview_json["summary"]["edge_count"] >= 1
    assert "timings" in preview_json["summary"]
    assert preview_json["snapshot_bundle"]["kind"] == "preview"
    assert Path(preview_json["snapshot_bundle"]["artifacts"]["file_manifest_file"]).exists()

    build = client.post("/api/build", json=payload)
    assert build.status_code == 200
    build_json = build.json()
    assert Path(build_json["artifacts"]["home_note"]).exists()
    assert Path(build_json["artifacts"]["graph_file"]).exists()
    assert build_json["snapshot_bundle"]["kind"] == "build"
    assert Path(build_json["snapshot_bundle"]["artifacts"]["architecture_summary_file"]).exists()

    bundles = client.get("/api/snapshot-bundles")
    assert bundles.status_code == 200
    bundles_json = bundles.json()
    assert len(bundles_json) >= 2

    bundle_detail = client.get(f"/api/snapshot-bundles/{build_json['snapshot_bundle']['id']}")
    assert bundle_detail.status_code == 200
    detail_json = bundle_detail.json()
    assert detail_json["contents"]["file_manifest"]["summary"]["file_count"] == 2
    assert "architecture_summary" in detail_json["contents"]


def test_canvas_round_trip_supports_viewport_and_group_cards(tmp_path: Path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)

    created = client.post(
        "/api/canvases",
        json={
            "name": "Architecture board",
            "description": "Working board",
            "viewport": {"x": 120, "y": 80, "zoom": 0.76},
            "cards": [
                {
                    "id": "group-1",
                    "type": "group",
                    "label": "Core cluster",
                    "note": "Group note",
                    "x": 40,
                    "y": 55,
                    "width": 520,
                    "height": 320,
                    "color": "amber",
                    "locked": True,
                },
                {
                    "id": "text-1",
                    "type": "text",
                    "label": "Question",
                    "text": "How do imports cross layers?",
                    "x": 160,
                    "y": 120,
                    "width": 320,
                    "height": 220,
                    "color": "mint",
                },
            ],
            "edges": [{"id": "edge-1", "from_card": "group-1", "to_card": "text-1", "label": "contains", "color": "mint"}],
        },
    )
    assert created.status_code == 200
    created_json = created.json()
    assert created_json["viewport"]["zoom"] == 0.76
    assert created_json["cards"][0]["type"] == "group"
    assert created_json["cards"][0]["locked"] is True

    updated = client.put(
        f"/api/canvases/{created_json['id']}",
        json={
            "name": "Architecture board",
            "description": "Updated board",
            "viewport": {"x": 180, "y": 90, "zoom": 0.92},
            "cards": [
                {
                    "id": "group-1",
                    "type": "group",
                    "label": "Core cluster",
                    "note": "Updated note",
                    "x": 40,
                    "y": 55,
                    "width": 520,
                    "height": 320,
                    "color": "amber",
                    "locked": True,
                }
            ],
            "edges": [],
        },
    )
    assert updated.status_code == 200
    updated_json = updated.json()
    assert updated_json["description"] == "Updated board"
    assert updated_json["viewport"]["x"] == 180

    canvases = client.get("/api/canvases")
    assert canvases.status_code == 200
    canvases_json = canvases.json()
    saved = next(canvas for canvas in canvases_json if canvas["id"] == created_json["id"])
    assert saved["viewport"]["zoom"] == 0.92
    assert saved["cards"][0]["note"] == "Updated note"


def test_logic_and_explain_can_be_scoped_to_selected_files(tmp_path: Path, monkeypatch) -> None:
    source_dir = tmp_path / "docs"
    source_dir.mkdir()
    (source_dir / "README.md").write_text("# Readme\n\nTop file\n", encoding="utf-8")
    (source_dir / "NOTES.md").write_text("# Notes\n\nSecond file\n", encoding="utf-8")

    client = make_client(tmp_path, monkeypatch)
    config = {
        "vault_name": "Scoped Flow",
        "output_dir": str(tmp_path / "output"),
        "default_mode": "copy",
        "max_file_size_bytes": 5000000,
        "default_exclude": [],
        "default_include": [],
        "sources": [
            {
                "name": "docs",
                "category": "Docs",
                "path": str(source_dir),
                "include": ["*.md"],
                "exclude": [],
            }
        ],
    }

    logic = client.post(
        "/api/logic/profile",
        json={
            "config": config,
            "max_workers": 2,
            "selected_files": ["README.md"],
        },
    )
    assert logic.status_code == 200
    logic_json = logic.json()
    assert logic_json["profile"]["summary"]["file_count"] == 1
    assert logic_json["record"]["label"].endswith("(scoped)")

    preview = client.post("/api/preview", json={"config": config, "clean": True})
    assert preview.status_code == 200
    snapshot_bundle_id = preview.json()["snapshot_bundle"]["id"]

    explain = client.post(
        "/api/explain/bundles",
        json={
            "snapshot_bundle_id": snapshot_bundle_id,
            "logic_profile_id": logic_json["record"]["id"],
            "selected_files": ["README.md"],
        },
    )
    assert explain.status_code == 200
    explain_json = explain.json()
    assert explain_json["bundle"]["summary"]["top_file_count"] == 1
    assert explain_json["bundle"]["summary"]["selected_file_count"] == 1
    assert explain_json["bundle"]["top_files"][0]["rel_path"] == "README.md"


def test_canvas_bookmark_metadata_round_trip(tmp_path: Path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    response = client.post(
        "/api/bookmarks",
        json={
            "type": "canvas",
            "label": "Core scope",
            "metadata": {
                "canvas_id": "main-canvas",
                "selected_files": ["README.md", "SPEC.md"],
                "lane": "structure",
            },
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["type"] == "canvas"
    assert payload["metadata"]["canvas_id"] == "main-canvas"
    assert payload["metadata"]["selected_files"] == ["README.md", "SPEC.md"]


def test_canvas_templates_export_and_history_scope_entries(tmp_path: Path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)

    created = client.post(
        "/api/canvas-templates",
        json={
            "name": "Template A",
            "description": "Reusable layout",
            "cards": [],
            "edges": [],
            "viewport": {"x": 40, "y": 40, "zoom": 0.8},
        },
    )
    assert created.status_code == 200
    template = created.json()

    updated = client.put(
        f"/api/canvas-templates/{template['id']}",
        json={
            "name": "Template A",
            "description": "Updated reusable layout",
            "cards": [],
            "edges": [],
            "viewport": {"x": 80, "y": 60, "zoom": 0.9},
        },
    )
    assert updated.status_code == 200
    assert updated.json()["viewport"]["zoom"] == 0.9

    templates = client.get("/api/canvas-templates")
    assert templates.status_code == 200
    assert any(item["id"] == template["id"] for item in templates.json())

    bookmark = client.post(
        "/api/bookmarks",
        json={
            "type": "canvas",
            "label": "Saved scope",
            "metadata": {
                "canvas_id": "main-canvas",
                "selected_files": ["README.md"],
                "snapshot_bundle_id": "snapshot-1",
                "selected_card_labels": ["Core notes"],
            },
        },
    )
    assert bookmark.status_code == 200

    record = client.post(
        "/api/digital-brain/records",
        json={
            "kind": "topic",
            "title": "Topic: Core notes",
            "summary": "Imported from canvas export",
            "selected_files": ["README.md"],
            "source_scope_label": "Saved scope",
            "canvas_id": "main-canvas",
        },
    )
    assert record.status_code == 200

    export = client.post("/api/canvases/main-canvas/export")
    assert export.status_code == 200
    export_json = export.json()
    export_path = Path(export_json["path"])
    assert export_path.exists()
    export_payload = json.loads(export_path.read_text(encoding="utf-8"))
    assert export_payload["format_version"] == 2
    assert export_payload["kind"] == "canvas_board_package"
    assert export_payload["linked_scopes"][0]["label"] == "Saved scope"
    assert export_payload["linked_digital_brain_records"][0]["kind"] == "topic"

    timeline = client.get("/api/history/timeline")
    assert timeline.status_code == 200
    kinds = {item["kind"] for item in timeline.json()}
    assert "canvas_scope" in kinds


def test_canvas_import_and_snapshot_restore_round_trip(tmp_path: Path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)

    export_source = tmp_path / "canvas-import.json"
    export_source.write_text(
        (
            '{"format_version":2,"canvas":{"name":"Imported board","description":"Imported","cards":[],"edges":[],'
            '"viewport":{"x":10,"y":20,"zoom":0.7},"metadata":{"workflow":"architecture-review"}},'
            '"linked_scopes":[{"label":"Imported scope","metadata":{"canvas_id":"legacy-canvas","selected_files":["README.md"]}}],'
            '"linked_digital_brain_records":[{"kind":"task","title":"Task: Follow up","summary":"Imported record","selected_files":["README.md"],'
            '"source_scope_label":"Imported scope","canvas_id":"legacy-canvas"}]}\n'
        ),
        encoding="utf-8",
    )

    imported = client.post("/api/canvases/import", json={"path": str(export_source)})
    assert imported.status_code == 200
    imported_json = imported.json()
    canvas = imported_json["canvas"]
    assert canvas["name"] == "Imported board"
    assert canvas["metadata"]["workflow"] == "architecture-review"
    assert imported_json["imported_scope_count"] == 1
    assert imported_json["imported_record_count"] == 1

    bookmarks = client.get("/api/bookmarks")
    assert bookmarks.status_code == 200
    imported_scope = next(item for item in bookmarks.json() if item["type"] == "canvas")
    assert imported_scope["metadata"]["canvas_id"] == canvas["id"]

    records = client.get("/api/digital-brain/records")
    assert records.status_code == 200
    imported_record = next(item for item in records.json() if item["kind"] == "task")
    assert imported_record["canvas_id"] == canvas["id"]

    updated = client.put(
        f"/api/canvases/{canvas['id']}",
        json={
            "name": "Imported board changed",
            "description": "Changed",
            "cards": [],
            "edges": [],
            "viewport": {"x": 30, "y": 40, "zoom": 1.1},
            "metadata": {"workflow": "architecture-review"},
        },
    )
    assert updated.status_code == 200

    snapshot = client.post(
        f"/api/canvases/{canvas['id']}/snapshot",
        json={"label": "Imported board state", "snapshot_bundle_id": "bundle-1", "snapshot_bundle_label": "Bundle 1"},
    )
    assert snapshot.status_code == 200
    snapshot_id = snapshot.json()["id"]

    second_update = client.put(
        f"/api/canvases/{canvas['id']}",
        json={
            "name": "Imported board later",
            "description": "Later",
            "cards": [],
            "edges": [],
            "viewport": {"x": 99, "y": 99, "zoom": 1.4},
            "metadata": {"workflow": "architecture-review"},
        },
    )
    assert second_update.status_code == 200

    restored = client.post("/api/snapshots/restore", json={"snapshot_id": snapshot_id})
    assert restored.status_code == 200
    assert restored.json()["kind"] == "canvas_state"

    canvases = client.get("/api/canvases")
    assert canvases.status_code == 200
    restored_canvas = next(item for item in canvases.json() if item["id"] == canvas["id"])
    assert restored_canvas["name"] == "Imported board changed"

    timeline = client.get("/api/history/timeline")
    assert timeline.status_code == 200
    assert "canvas_state" in {item["kind"] for item in timeline.json()}


def test_canvas_import_renames_when_name_conflicts(tmp_path: Path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)

    export_source = tmp_path / "canvas-conflict.json"
    export_source.write_text(
        '{"format_version":2,"canvas":{"name":"Main Canvas","description":"Imported","cards":[],"edges":[],"viewport":{"x":10,"y":20,"zoom":0.7}}}\n',
        encoding="utf-8",
    )

    imported = client.post("/api/canvases/import", json={"path": str(export_source)})
    assert imported.status_code == 200
    payload = imported.json()
    assert payload["canvas"]["name"].startswith("Main Canvas (imported")
    assert payload["warnings"]


def test_digital_brain_record_round_trip(tmp_path: Path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)

    created = client.post(
        "/api/digital-brain/records",
        json={
            "kind": "memory",
            "title": "Memory: core architecture",
            "summary": "Promoted from canvas",
            "selected_files": ["README.md", "docs/ARCHITECTURE.md"],
            "source_scope_label": "Architecture board",
            "canvas_id": "main-canvas",
            "snapshot_bundle_id": "bundle-1",
            "snapshot_bundle_label": "Bundle 1",
            "status": "promoted",
            "confidence": 0.81,
        },
    )
    assert created.status_code == 200
    payload = created.json()
    assert payload["kind"] == "memory"
    assert payload["selected_files"] == ["README.md", "docs/ARCHITECTURE.md"]

    records = client.get("/api/digital-brain/records")
    assert records.status_code == 200
    assert any(item["id"] == payload["id"] for item in records.json())

    bootstrap = client.get("/api/bootstrap")
    assert bootstrap.status_code == 200
    assert any(item["id"] == payload["id"] for item in bootstrap.json()["digital_brain_records"])

    updated = client.put(
        f"/api/digital-brain/records/{payload['id']}",
        json={
            "kind": "memory",
            "title": "Memory: core architecture",
            "summary": "Reviewed and approved",
            "selected_files": ["README.md"],
            "source_scope_label": "Architecture board",
            "canvas_id": "main-canvas",
            "snapshot_bundle_id": "bundle-1",
            "snapshot_bundle_label": "Bundle 1",
            "status": "promoted",
            "confidence": 0.9,
            "review_status": "approved",
            "provenance_notes": "Confirmed from board review.",
        },
    )
    assert updated.status_code == 200
    assert updated.json()["review_status"] == "approved"

    deleted = client.delete(f"/api/digital-brain/records/{payload['id']}")
    assert deleted.status_code == 200
    records_after = client.get("/api/digital-brain/records")
    assert all(item["id"] != payload["id"] for item in records_after.json())


def test_preview_graph_includes_folder_hierarchy_nodes(tmp_path: Path, monkeypatch) -> None:
    source_dir = tmp_path / "docs"
    nested_dir = source_dir / "guides" / "api"
    nested_dir.mkdir(parents=True)
    (nested_dir / "README.md").write_text("# API Guide\n", encoding="utf-8")

    client = make_client(tmp_path, monkeypatch)
    payload = {
        "config": {
            "vault_name": "Hierarchy Vault",
            "output_dir": str(tmp_path / "output"),
            "default_mode": "copy",
            "max_file_size_bytes": 5000000,
            "default_exclude": [],
            "default_include": [],
            "sources": [
                {
                    "name": "demo-docs",
                    "category": "Docs",
                    "path": str(source_dir),
                    "include": ["**/*.md"],
                    "exclude": [],
                }
            ],
        },
        "clean": True,
    }

    preview = client.post("/api/preview", json=payload)
    assert preview.status_code == 200
    preview_json = preview.json()
    node_ids = {node["id"] for node in preview_json["graph"]["nodes"]}
    edge_pairs = {(edge["from"], edge["to"]) for edge in preview_json["graph"]["edges"]}

    assert "folder:demo-docs:guides" in node_ids
    assert "folder:demo-docs:guides/api" in node_ids
    assert ("source:demo-docs", "folder:demo-docs:guides") in edge_pairs
    assert ("folder:demo-docs:guides", "folder:demo-docs:guides/api") in edge_pairs
    assert ("folder:demo-docs:guides/api", "file:demo-docs:guides/api/README.md") in edge_pairs


def test_bootstrap_ignores_stale_last_result_when_config_changes(tmp_path: Path, monkeypatch) -> None:
    state_dir = tmp_path / "state"
    monkeypatch.setenv("CONTEXT_VAULT_STATE_DIR", str(state_dir))
    import importlib
    import context_vault_studio.storage as storage_module
    import context_vault_studio.api.app as app_module

    importlib.reload(storage_module)
    app_module = importlib.reload(app_module)

    state_dir.mkdir(parents=True, exist_ok=True)
    (state_dir / "workspace_config.json").write_text(
        """
{
  "vault_name": "Current",
  "output_dir": "/tmp/current",
  "default_mode": "copy",
  "max_file_size_bytes": 5000000,
  "default_exclude": [],
  "default_include": [],
  "access": {
    "allowed_roots": ["/tmp/current"],
    "blocked_paths": [],
    "blocked_patterns": [],
    "enforce_copy_mode": true
  },
  "sources": [
    {
      "name": "current",
      "category": "Docs",
      "path": "/tmp/current",
      "include": ["*.md"],
      "exclude": []
    }
  ]
}
""".strip()
        + "\n",
        encoding="utf-8",
    )
    (state_dir / "last_result.json").write_text(
        """
{
  "config": {
    "vault_name": "Old",
    "output_dir": "/tmp/old",
    "default_mode": "copy",
    "max_file_size_bytes": 5000000,
    "default_exclude": [],
    "default_include": [],
    "access": {
      "allowed_roots": ["/tmp/old"],
      "blocked_paths": [],
      "blocked_patterns": [],
      "enforce_copy_mode": true
    },
    "sources": [
      {
        "name": "old",
        "category": "Docs",
        "path": "/tmp/old",
        "include": ["*.md"],
        "exclude": []
      }
    ]
  },
  "summary": {
    "file_count": 1
  }
}
""".strip()
        + "\n",
        encoding="utf-8",
    )

    client = TestClient(app_module.app)
    response = client.get("/api/bootstrap")
    assert response.status_code == 200
    assert response.json()["last_result"] is None


def test_path_inspect_lists_children(tmp_path: Path, monkeypatch) -> None:
    target = tmp_path / "workspace"
    target.mkdir()
    (target / "docs").mkdir()
    (target / "README.md").write_text("# Hello\n", encoding="utf-8")

    client = make_client(tmp_path, monkeypatch)
    response = client.post("/api/path-inspect", json={"path": str(target)})
    assert response.status_code == 200
    payload = response.json()
    assert payload["exists"] is True
    assert payload["is_dir"] is True
    assert len(payload["children"]) == 2


def test_path_inspect_respects_access_policy(tmp_path: Path, monkeypatch) -> None:
    allowed = tmp_path / "allowed"
    blocked = allowed / "secret"
    allowed.mkdir()
    blocked.mkdir()
    (allowed / "public.md").write_text("# Public\n", encoding="utf-8")
    (blocked / "private.md").write_text("# Private\n", encoding="utf-8")

    client = make_client(tmp_path, monkeypatch)
    response = client.post(
        "/api/path-inspect",
        json={
            "path": str(allowed),
            "access": {
                "allowed_roots": [str(allowed)],
                "blocked_paths": [str(blocked)],
                "blocked_patterns": [],
                "enforce_copy_mode": True,
            },
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["accessible"] is True
    assert payload["blocked_child_count"] == 1
    assert [child["name"] for child in payload["children"]] == ["public.md"]


def test_path_inspect_respects_blocked_patterns(tmp_path: Path, monkeypatch) -> None:
    allowed = tmp_path / "allowed"
    allowed.mkdir()
    (allowed / "public.md").write_text("# Public\n", encoding="utf-8")
    (allowed / "secret.key").write_text("secret\n", encoding="utf-8")

    client = make_client(tmp_path, monkeypatch)
    response = client.post(
        "/api/path-inspect",
        json={
            "path": str(allowed),
            "access": {
                "allowed_roots": [str(allowed)],
                "blocked_paths": [],
                "blocked_patterns": ["*.key"],
                "enforce_copy_mode": True,
            },
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["accessible"] is True
    assert payload["blocked_child_count"] == 1
    assert [child["name"] for child in payload["children"]] == ["public.md"]


def test_file_preview_reads_markdown(tmp_path: Path, monkeypatch) -> None:
    allowed = tmp_path / "allowed"
    allowed.mkdir()
    note = allowed / "README.md"
    note.write_text("# Demo\n\nHello world\n", encoding="utf-8")

    client = make_client(tmp_path, monkeypatch)
    response = client.post(
        "/api/file-preview",
        json={
            "path": str(note),
            "access": {
                "allowed_roots": [str(allowed)],
                "blocked_paths": [],
                "blocked_patterns": [],
                "enforce_copy_mode": True,
            },
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["kind"] == "text"
    assert "Hello world" in payload["content"]
    assert payload["headings"][0]["text"] == "Demo"


def test_create_preset(tmp_path: Path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    response = client.post(
        "/api/presets",
        json={
            "name": "Research Vault",
            "description": "Preset for research notes",
            "config": {
                "vault_name": "Research Vault",
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
                "sources": [],
            },
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["name"] == "Research Vault"


def test_bootstrap_includes_guided_demo_example(tmp_path: Path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)
    response = client.get("/api/bootstrap")
    assert response.status_code == 200
    payload = response.json()
    labels = [example["label"] for example in payload["examples"]]
    assert "Guided Demo" in labels
    assert payload["config"]["sources"] == []


def test_build_adapter_contracts_and_capabilities(tmp_path: Path, monkeypatch) -> None:
    client = make_client(tmp_path, monkeypatch)

    capabilities = client.get("/api/build-adapters/capabilities")
    assert capabilities.status_code == 200
    capabilities_json = capabilities.json()
    adapter_ids = {item["adapter_id"] for item in capabilities_json}
    assert {"deterministic", "cloud_api", "local_server", "local_cli", "file_handshake"} <= adapter_ids

    contracts = client.get("/api/build-adapters/contracts")
    assert contracts.status_code == 200
    contracts_json = contracts.json()
    assert "build_task_request" in contracts_json
    assert "normalized_build_result" in contracts_json
    assert "validation_report" in contracts_json


def test_build_task_packet_uses_snapshot_bundle(tmp_path: Path, monkeypatch) -> None:
    source_dir = tmp_path / "docs"
    source_dir.mkdir()
    (source_dir / "README.md").write_text("# Demo Vault\n\nA top note.\n", encoding="utf-8")

    client = make_client(tmp_path, monkeypatch)
    preview = client.post(
        "/api/preview",
        json={
            "config": {
                "vault_name": "Demo Vault",
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
                "sources": [
                    {
                        "name": "demo-docs",
                        "category": "Docs",
                        "path": str(source_dir),
                        "include": ["*.md"],
                        "exclude": [],
                    }
                ],
            },
            "clean": True,
        },
    )
    assert preview.status_code == 200
    bundle_id = preview.json()["snapshot_bundle"]["id"]

    packet = client.post(
        "/api/build-adapters/task-packet",
        json={
            "goal": "Generate a governed plan for a docs cleanup pass",
            "snapshot_bundle_id": bundle_id,
            "selected_slcs_pieces": ["docs_cleanup_piece"],
            "response_schema": "plan_json_plus_patch",
        },
    )
    assert packet.status_code == 200
    packet_json = packet.json()
    assert packet_json["snapshot_bundle_id"] == bundle_id
    assert packet_json["selected_slcs_pieces"] == ["docs_cleanup_piece"]
    assert packet_json["scope"]["file_count"] == 1
    assert packet_json["policy_bundle"]["access"]["enforce_copy_mode"] is True


def test_build_adapter_run_returns_normalized_stub_result(tmp_path: Path, monkeypatch) -> None:
    source_dir = tmp_path / "docs"
    source_dir.mkdir()
    (source_dir / "README.md").write_text("# Demo Vault\n\nA top note.\n", encoding="utf-8")

    client = make_client(tmp_path, monkeypatch)
    preview = client.post(
        "/api/preview",
        json={
            "config": {
                "vault_name": "Demo Vault",
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
                "sources": [
                    {
                        "name": "demo-docs",
                        "category": "Docs",
                        "path": str(source_dir),
                        "include": ["*.md"],
                        "exclude": [],
                    }
                ],
            },
            "clean": True,
        },
    )
    assert preview.status_code == 200
    bundle_id = preview.json()["snapshot_bundle"]["id"]

    run_result = client.post(
        "/api/build-adapters/run",
        json={
            "goal": "Plan a docs cleanup pass",
            "snapshot_bundle_id": bundle_id,
            "adapter_id": "local_cli",
            "selected_slcs_pieces": ["docs_cleanup_piece"],
        },
    )
    assert run_result.status_code == 200
    run_json = run_result.json()
    assert run_json["task_packet"]["snapshot_bundle_id"] == bundle_id
    assert run_json["adapter_capabilities"]["adapter_id"] == "local_cli"
    assert run_json["normalized_result"]["adapter_id"] == "local_cli"
    assert run_json["normalized_result"]["status"] == "needs_revision"


def test_deterministic_adapter_generates_manifest_and_actions(tmp_path: Path, monkeypatch) -> None:
    source_dir = tmp_path / "docs"
    source_dir.mkdir()
    (source_dir / "README.md").write_text("# Demo Vault\n\nA top note.\n", encoding="utf-8")

    client = make_client(tmp_path, monkeypatch)
    preview = client.post(
        "/api/preview",
        json={
            "config": {
                "vault_name": "Demo Vault",
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
                "sources": [
                    {
                        "name": "demo-docs",
                        "category": "Docs",
                        "path": str(source_dir),
                        "include": ["*.md"],
                        "exclude": [],
                    }
                ],
            },
            "clean": True,
        },
    )
    assert preview.status_code == 200
    bundle_id = preview.json()["snapshot_bundle"]["id"]

    run_result = client.post(
        "/api/build-adapters/run",
        json={
            "goal": "Create a deterministic docs cleanup plan",
            "snapshot_bundle_id": bundle_id,
            "adapter_id": "deterministic",
            "selected_slcs_pieces": ["docs_cleanup_piece", "summary_validator_piece"],
        },
    )
    assert run_result.status_code == 200
    run_json = run_result.json()
    normalized = run_json["normalized_result"]
    assert normalized["adapter_id"] == "deterministic"
    assert normalized["status"] == "ok"
    assert normalized["file_actions"]
    assert normalized["artifacts"]["deterministic_manifest"]["entries"]
    assert normalized["plan"]["selected_piece_count"] == 2


def test_patch_gate_creates_preview_and_validation_artifacts(tmp_path: Path, monkeypatch) -> None:
    source_dir = tmp_path / "docs"
    source_dir.mkdir()
    readme = source_dir / "README.md"
    readme.write_text("# Demo Vault\n\nA top note.\n", encoding="utf-8")

    client = make_client(tmp_path, monkeypatch)
    preview = client.post(
        "/api/preview",
        json={
            "config": {
                "vault_name": "Demo Vault",
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
                "sources": [
                    {
                        "name": "demo-docs",
                        "category": "Docs",
                        "path": str(source_dir),
                        "include": ["*.md"],
                        "exclude": [],
                    }
                ],
            },
            "clean": True,
        },
    )
    assert preview.status_code == 200
    bundle_id = preview.json()["snapshot_bundle"]["id"]

    patch_gate = client.post(
        "/api/build-adapters/patch-gate",
        json={
            "goal": "Create a deterministic docs cleanup plan",
            "snapshot_bundle_id": bundle_id,
            "adapter_id": "deterministic",
            "selected_slcs_pieces": ["docs_cleanup_piece"],
            "selected_files": ["README.md"],
        },
    )
    assert patch_gate.status_code == 200
    payload = patch_gate.json()
    assert Path(payload["artifacts"]["patch_bundle_file"]).exists()
    assert Path(payload["artifacts"]["validation_report_file"]).exists()
    assert payload["copied_file_count"] == 1

    detail = client.get(f"/api/build-adapters/patch-previews/{payload['id']}")
    assert detail.status_code == 200
    detail_json = detail.json()
    assert detail_json["contents"]["patch_bundle"]["file_actions"]
    assert detail_json["contents"]["validation_report"]["status"] in {"pass", "warning", "fail"}


def test_apply_preview_creates_scratch_run_and_reconciliation(tmp_path: Path, monkeypatch) -> None:
    source_dir = tmp_path / "docs"
    source_dir.mkdir()
    (source_dir / "README.md").write_text("# Demo Vault\n\nA top note.\n", encoding="utf-8")

    client = make_client(tmp_path, monkeypatch)
    preview = client.post(
        "/api/preview",
        json={
            "config": {
                "vault_name": "Demo Vault",
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
                "sources": [
                    {
                        "name": "demo-docs",
                        "category": "Docs",
                        "path": str(source_dir),
                        "include": ["*.md"],
                        "exclude": [],
                    }
                ],
            },
            "clean": True,
        },
    )
    assert preview.status_code == 200
    bundle_id = preview.json()["snapshot_bundle"]["id"]

    patch_gate = client.post(
        "/api/build-adapters/patch-gate",
        json={
            "goal": "Create a deterministic docs cleanup plan",
            "snapshot_bundle_id": bundle_id,
            "adapter_id": "deterministic",
            "selected_slcs_pieces": ["docs_cleanup_piece"],
            "selected_files": ["README.md"],
        },
    )
    assert patch_gate.status_code == 200
    preview_id = patch_gate.json()["id"]

    apply_run = client.post(f"/api/build-adapters/apply-preview/{preview_id}")
    assert apply_run.status_code == 200
    apply_json = apply_run.json()
    assert Path(apply_json["artifacts"]["reconciliation_report_file"]).exists()
    assert Path(apply_json["rollback_dir"]).exists()
    assert Path(apply_json["scratch_apply_dir"]).exists()
    assert apply_json["reconciliation_report"]["changed_files"]

    detail = client.get(f"/api/build-adapters/apply-runs/{apply_json['id']}")
    assert detail.status_code == 200
    detail_json = detail.json()
    assert detail_json["contents"]["apply_summary"]["changed_file_count"] >= 1
    assert detail_json["contents"]["reconciliation_report"]["after_snapshot_id"]


def test_parallel_scan_profile_returns_worker_summary(tmp_path: Path, monkeypatch) -> None:
    source_dir = tmp_path / "docs"
    source_dir.mkdir()
    (source_dir / "README.md").write_text("# Demo Vault\n\nA top note.\n", encoding="utf-8")
    (source_dir / "notes.txt").write_text("hello\n", encoding="utf-8")

    client = make_client(tmp_path, monkeypatch)
    response = client.post(
        "/api/parallel-scan/profile",
        json={
            "config": {
                "vault_name": "Parallel Profile",
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
                "sources": [
                    {
                        "name": "demo-docs",
                        "category": "Docs",
                        "path": str(source_dir),
                        "include": ["*.*"],
                        "exclude": [],
                    }
                ],
            },
            "max_workers": 2,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["record"]["worker_count"] == 2
    assert payload["profile"]["summary"]["file_count"] == 2
    assert payload["profile"]["top_extensions"]


def test_parallel_scan_delta_detects_changed_files(tmp_path: Path, monkeypatch) -> None:
    source_dir = tmp_path / "docs"
    source_dir.mkdir()
    readme = source_dir / "README.md"
    readme.write_text("# Demo Vault\n\nA top note.\n", encoding="utf-8")

    client = make_client(tmp_path, monkeypatch)
    preview = client.post(
        "/api/preview",
        json={
            "config": {
                "vault_name": "Delta Vault",
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
                "sources": [
                    {
                        "name": "demo-docs",
                        "category": "Docs",
                        "path": str(source_dir),
                        "include": ["*.md"],
                        "exclude": [],
                    }
                ],
            },
            "clean": True,
        },
    )
    assert preview.status_code == 200
    previous_bundle_id = preview.json()["snapshot_bundle"]["id"]

    readme.write_text("# Demo Vault\n\nUpdated content.\n", encoding="utf-8")

    delta = client.post(
        "/api/parallel-scan/delta",
        json={
            "previous_snapshot_bundle_id": previous_bundle_id,
            "config": {
                "vault_name": "Delta Vault",
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
                "sources": [
                    {
                        "name": "demo-docs",
                        "category": "Docs",
                        "path": str(source_dir),
                        "include": ["*.md"],
                        "exclude": [],
                    }
                ],
            },
        },
    )
    assert delta.status_code == 200
    delta_json = delta.json()
    assert delta_json["record"]["changed_count"] == 1
    assert "README.md" in delta_json["delta"]["changed_files"]


def test_live_monitor_detects_and_flushes_changes(tmp_path: Path, monkeypatch) -> None:
    source_dir = tmp_path / "docs"
    source_dir.mkdir()
    readme = source_dir / "README.md"
    readme.write_text("# Demo Vault\n\nA top note.\n", encoding="utf-8")

    client = make_client(tmp_path, monkeypatch)
    start = client.post(
        "/api/live-monitor/start",
        json={
            "config": {
                "vault_name": "Live Monitor Vault",
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
                "sources": [
                    {
                        "name": "demo-docs",
                        "category": "Docs",
                        "path": str(source_dir),
                        "include": ["*.md"],
                        "exclude": [],
                    }
                ],
            },
            "debounce_ms": 0,
        },
    )
    assert start.status_code == 200
    monitor_id = start.json()["id"]

    readme.write_text("# Demo Vault\n\nChanged.\n", encoding="utf-8")
    poll = client.post(f"/api/live-monitor/{monitor_id}/poll")
    assert poll.status_code == 200
    poll_json = poll.json()
    assert poll_json["new_event_count"] >= 1

    flush = client.post(f"/api/live-monitor/{monitor_id}/flush")
    assert flush.status_code == 200
    flush_json = flush.json()
    assert flush_json["summary"]["modified"] >= 1


def test_logic_profile_extracts_symbols_and_routes(tmp_path: Path, monkeypatch) -> None:
    source_dir = tmp_path / "repo"
    source_dir.mkdir()
    (source_dir / "app.py").write_text(
        "from storage import save_file\n\n@app.get('/health')\ndef health():\n    return {'ok': True}\n",
        encoding="utf-8",
    )
    (source_dir / "storage.py").write_text(
        "def save_file(path):\n    return path\n\nSTORAGE_BACKEND = 'sqlite'\n",
        encoding="utf-8",
    )

    client = make_client(tmp_path, monkeypatch)
    response = client.post(
        "/api/logic/profile",
        json={
            "config": {
                "vault_name": "Logic Vault",
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
                "sources": [
                    {
                        "name": "code",
                        "category": "Repo",
                        "path": str(source_dir),
                        "include": ["*.py"],
                        "exclude": [],
                    }
                ],
            },
            "max_workers": 2,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["profile"]["summary"]["file_count"] == 2
    assert payload["profile"]["summary"]["import_count"] >= 1
    assert payload["profile"]["summary"]["symbol_count"] >= 2
    assert payload["profile"]["summary"]["route_count"] >= 1
    assert payload["profile"]["summary"]["storage_touch_count"] >= 1


def test_explain_bundle_feeds_into_build_task_packet(tmp_path: Path, monkeypatch) -> None:
    source_dir = tmp_path / "repo"
    source_dir.mkdir()
    (source_dir / "app.py").write_text(
        "from storage import save_file\n\ndef health():\n    return save_file('x')\n",
        encoding="utf-8",
    )
    (source_dir / "storage.py").write_text("def save_file(path):\n    return path\n", encoding="utf-8")

    client = make_client(tmp_path, monkeypatch)
    preview = client.post(
        "/api/preview",
        json={
            "config": {
                "vault_name": "Explain Vault",
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
                "sources": [
                    {
                        "name": "code",
                        "category": "Repo",
                        "path": str(source_dir),
                        "include": ["*.py"],
                        "exclude": [],
                    }
                ],
            },
            "clean": True,
        },
    )
    assert preview.status_code == 200
    snapshot_bundle_id = preview.json()["snapshot_bundle"]["id"]

    logic = client.post(
        "/api/logic/profile",
        json={
            "config": {
                "vault_name": "Explain Vault",
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
                "sources": [
                    {
                        "name": "code",
                        "category": "Repo",
                        "path": str(source_dir),
                        "include": ["*.py"],
                        "exclude": [],
                    }
                ],
            },
            "max_workers": 2,
        },
    )
    assert logic.status_code == 200
    logic_profile_id = logic.json()["record"]["id"]

    explain = client.post(
        "/api/explain/bundles",
        json={
            "snapshot_bundle_id": snapshot_bundle_id,
            "logic_profile_id": logic_profile_id,
        },
    )
    assert explain.status_code == 200
    explain_bundle_id = explain.json()["record"]["id"]

    packet = client.post(
        "/api/build-adapters/task-packet",
        json={
            "goal": "Use explain context in build planning",
            "snapshot_bundle_id": snapshot_bundle_id,
            "explain_bundle_id": explain_bundle_id,
            "selected_slcs_pieces": ["service_split_piece"],
        },
    )
    assert packet.status_code == 200
    packet_json = packet.json()
    assert packet_json["metadata"]["explain_bundle_id"] == explain_bundle_id
    assert packet_json["metadata"]["explain_summary"]["top_file_count"] >= 1


def test_history_timeline_and_compare(tmp_path: Path, monkeypatch) -> None:
    source_dir = tmp_path / "docs"
    source_dir.mkdir()
    note = source_dir / "README.md"
    note.write_text("# One\n", encoding="utf-8")

    client = make_client(tmp_path, monkeypatch)
    first = client.post(
        "/api/preview",
        json={
            "config": {
                "vault_name": "History Vault",
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
        },
    )
    assert first.status_code == 200
    first_bundle_id = first.json()["snapshot_bundle"]["id"]

    note.write_text("# Two\nChanged\n", encoding="utf-8")
    second = client.post(
        "/api/preview",
        json={
            "config": {
                "vault_name": "History Vault",
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
        },
    )
    assert second.status_code == 200
    second_bundle_id = second.json()["snapshot_bundle"]["id"]

    timeline = client.get("/api/history/timeline")
    assert timeline.status_code == 200
    timeline_json = timeline.json()
    kinds = {item["kind"] for item in timeline_json}
    assert "snapshot_bundle" in kinds

    compare = client.post(
        "/api/history/compare",
        json={
            "left_snapshot_bundle_id": first_bundle_id,
            "right_snapshot_bundle_id": second_bundle_id,
        },
    )
    assert compare.status_code == 200
    compare_json = compare.json()
    assert compare_json["summary"]["changed_count"] == 1
    assert "README.md" in compare_json["changed_files"]
