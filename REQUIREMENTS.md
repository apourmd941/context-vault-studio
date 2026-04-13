# Context Vault Studio Requirements

## Supported Targets

- macOS
- Linux
- Windows
- Chrome or Chromium-based browsers with WebGL enabled

## Core Runtime

- Python 3.11+
- Node.js 20+
- npm 10+

## Python Dependencies

Install from:

- `requirements.txt`
- `requirements-dev.txt`

Core packages include:

- FastAPI
- Uvicorn
- Pydantic v2
- httpx
- psutil
- pytest
- ruff

## Frontend Dependencies

Frontend dependencies are managed in:

- `frontend/package.json`

Notable frontend packages include:

- `react-force-graph-3d` for the true WebGL graph surface

Install with:

```bash
npm --prefix frontend install
```

## Local Startup

Preferred entrypoints:

- Bash:
  - `./start.sh`
  - `./stop.sh`
- PowerShell:
  - `./start.ps1`
  - `./stop.ps1`

Registry-assigned ports on this machine:

- backend: `12045`
- frontend: `12046`
- reserved: `12047-12049`

## Manual Development

Backend:

```bash
python3 -m venv .venv
./.venv/bin/python -m pip install -r requirements.txt -r requirements-dev.txt
./.venv/bin/python -m uvicorn context_vault_studio.api.app:app --app-dir backend --host 127.0.0.1 --port 12045
```

Frontend:

```bash
npm --prefix frontend install
npm --prefix frontend run dev
```

## Verification

Quick local checks:

```bash
python3 -m pytest backend/tests -q
python3 -m ruff check backend scripts tools
npm --prefix frontend test
npm --prefix frontend run build
```

## Operator Features

- access-controlled path inspection
- async preview and build jobs
- explorer and quick switcher
- WebGL graph view with orbit, pan, zoom, node focus, and indexed-node search
- markdown, image, and PDF preview
- text note editing and note creation
- bookmarks and snapshots
- canvas board view
- export bundle creation

## Distribution Notes

- The app is local-first and does not require cloud secrets.
- Share the repo plus these install commands.
- Other machines should use the same registry-based startup flow, which will create or reuse that machine's own assigned 5-port block for this app id.
