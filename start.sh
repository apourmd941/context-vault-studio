#!/usr/bin/env bash
set -euo pipefail

if [ ! -x ".venv/bin/python" ]; then
  python3 -m venv .venv
  ./.venv/bin/python -m pip install -r requirements.txt -r requirements-dev.txt
fi

./.venv/bin/python scripts/runtime_manager.py start
