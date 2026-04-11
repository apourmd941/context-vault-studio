$ErrorActionPreference = "Stop"
if (!(Test-Path ".venv\Scripts\python.exe")) {
  python -m venv .venv
  .\.venv\Scripts\python.exe -m pip install -r requirements.txt -r requirements-dev.txt
}

.\.venv\Scripts\python.exe scripts/runtime_manager.py start
