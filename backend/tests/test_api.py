from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient


def make_client(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("CONTEXT_VAULT_STATE_DIR", str(tmp_path / "state"))
    from context_vault_studio.api.app import app

    return TestClient(app)


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
    assert payload["config"]["sources"]


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
