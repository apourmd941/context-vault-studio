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

    build = client.post("/api/build", json=payload)
    assert build.status_code == 200
    build_json = build.json()
    assert Path(build_json["artifacts"]["home_note"]).exists()
    assert Path(build_json["artifacts"]["graph_file"]).exists()


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
