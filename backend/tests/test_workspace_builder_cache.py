from __future__ import annotations

import importlib
from pathlib import Path


def load_modules(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("CONTEXT_VAULT_STATE_DIR", str(tmp_path / "state"))
    import context_vault_studio.storage as storage_module
    import context_vault_studio.services.workspace_builder as workspace_builder_module

    importlib.reload(storage_module)
    workspace_builder_module = importlib.reload(workspace_builder_module)
    return storage_module, workspace_builder_module


def test_workspace_builder_reuses_cached_file_analysis(tmp_path: Path, monkeypatch) -> None:
    storage_module, workspace_builder_module = load_modules(tmp_path, monkeypatch)

    source_dir = tmp_path / "docs"
    source_dir.mkdir()
    sample = source_dir / "README.md"
    sample.write_text("# Cached summary\n\nHello world.\n", encoding="utf-8")

    config = {
        "vault_name": "Cache Test",
        "output_dir": str(tmp_path / "output"),
        "default_mode": "copy",
        "max_file_size_bytes": 5_000_000,
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
    }

    first = workspace_builder_module.build_workspace_from_config(
        config,
        base_dir=tmp_path,
        dry_run=True,
        clean=True,
    )
    assert first["summary"]["file_count"] == 1
    cache = storage_module.load_file_analysis_cache()
    assert str(sample) in cache

    monkeypatch.setattr(
        workspace_builder_module,
        "hash_file",
        lambda _path: (_ for _ in ()).throw(AssertionError("hash_file should not run for unchanged cached files")),
    )
    monkeypatch.setattr(
        workspace_builder_module,
        "extract_summary",
        lambda _path: (_ for _ in ()).throw(AssertionError("extract_summary should not run for unchanged cached files")),
    )

    second = workspace_builder_module.build_workspace_from_config(
        config,
        base_dir=tmp_path,
        dry_run=True,
        clean=True,
    )
    assert second["summary"]["file_count"] == 1


def test_refresh_style_build_replaces_read_only_outputs_and_removes_stale_files(tmp_path: Path, monkeypatch) -> None:
    _storage_module, workspace_builder_module = load_modules(tmp_path, monkeypatch)

    source_dir = tmp_path / "docs"
    source_dir.mkdir()
    sample = source_dir / "README.md"
    sample.write_text("# First version\n", encoding="utf-8")
    sample.chmod(0o444)

    config = {
        "vault_name": "Refresh Test",
        "output_dir": str(tmp_path / "output"),
        "default_mode": "copy",
        "max_file_size_bytes": 5_000_000,
        "default_exclude": [],
        "default_include": [],
        "access": {
            "allowed_roots": [str(source_dir)],
            "blocked_paths": [],
            "blocked_patterns": [],
            "enforce_copy_mode": True,
        },
        "global_exclusions": {
            "blocked_paths": [],
            "blocked_patterns": [".DS_Store", ".git/**"],
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
    }

    first = workspace_builder_module.build_workspace_from_config(
        config,
        base_dir=tmp_path,
        dry_run=False,
        clean=True,
    )
    built_path = Path(first["artifacts"]["vault_dir"]) / "Sources" / "docs" / "README.md"
    assert built_path.exists()

    stale_path = Path(first["artifacts"]["vault_dir"]) / "Sources" / "docs" / ".git" / "objects" / "00" / "stale"
    stale_path.parent.mkdir(parents=True, exist_ok=True)
    stale_path.write_text("stale\n", encoding="utf-8")
    assert stale_path.exists()

    sample.chmod(0o644)
    sample.write_text("# Second version\n", encoding="utf-8")

    second = workspace_builder_module.build_workspace_from_config(
        config,
        base_dir=tmp_path,
        dry_run=False,
        clean=False,
    )

    refreshed_path = Path(second["artifacts"]["vault_dir"]) / "Sources" / "docs" / "README.md"
    assert refreshed_path.read_text(encoding="utf-8") == "# Second version\n"
    assert not stale_path.exists()
