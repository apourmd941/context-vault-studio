#!/usr/bin/env python3
"""CLI wrapper for the shared Context Vault Studio workspace builder."""

from __future__ import annotations

import argparse
import importlib
import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "backend"))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a curated Obsidian-style workspace from selected folders."
    )
    parser.add_argument("--config", required=True, help="Path to a JSON config file.")
    parser.add_argument("--dry-run", action="store_true", help="Scan without writing output files.")
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Remove any existing output directory before writing.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    config_path = Path(args.config).expanduser().resolve()
    if not config_path.exists():
        print(f"Config file not found: {config_path}", file=sys.stderr)
        return 1

    builder_module = importlib.import_module("context_vault_studio.services.workspace_builder")

    try:
        result = builder_module.build_workspace_from_file(
            config_path,
            dry_run=args.dry_run,
            clean=args.clean,
        )
    except Exception as exc:  # pragma: no cover - CLI guard
        print(f"Build failed: {exc}", file=sys.stderr)
        return 1

    print(json.dumps(result["summary"] | {"output_dir": result["artifacts"]["output_dir"]}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
