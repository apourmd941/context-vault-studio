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
