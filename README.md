# Context Vault Studio

Context Vault Studio is a cross-platform local app for building curated, Obsidian-inspired AI workspaces.

Instead of pointing Claude or Codex at a giant parent folder, you define a tighter corpus of docs, manuals, project notes, and selected repo slices. The app previews the match set, builds a shareable vault, and emits machine-readable graph data for more targeted retrieval.

## Stack

- Backend: FastAPI
- Frontend: React 18 + Vite
- Runtime: Python virtualenv + npm
- Startup: shared localhost app-port registry

## App Identity

- Name: `Context Vault Studio`
- App id: `context-vault-studio`
- Path: `/Users/aidin/NeutronDev/obsidien style mapping`
- Shared port registry block: `12045-12049`
- Backend port: `12045`
- Frontend port: `12046`
- Reserved ports: `12047-12049`

## What It Does

- lets you define sources with include and exclude patterns
- previews matched files before writing anything
- builds an Obsidian-friendly vault with home and map notes
- exports `context_graph.json` and `manifest.json`
- renders an Obsidian-style local graph in the UI
- supports explorer, quick switcher, note preview, backlinks, and outgoing links
- runs preview and build work as background jobs with persisted history
- enforces allow and block rules before preview, path inspection, and build
- persists the last workspace layout locally
- supports both `copy` and `symlink` modes

## Run It

macOS or Linux:

```bash
./start.sh
```

Windows PowerShell:

```powershell
./start.ps1
```

Stop it with:

```bash
./stop.sh
```

or:

```powershell
./stop.ps1
```

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

## CLI Builder

The original builder still exists as a CLI wrapper:

```bash
python3 tools/build_context_workspace.py --config config/neutron_curated.example.json --dry-run
```

## Access Boundary

The app now supports:

- `allowed_roots`
- `blocked_paths`
- `blocked_patterns`
- `enforce_copy_mode`

Those rules are enforced by the backend when the app peeks at paths, previews sources, and builds the generated vault.

Important:

- this gives the app its own boundary
- it does not revoke filesystem access that an external tool already has outside the app
- for a true AI boundary, point Claude/Codex at the generated vault or connect them through this app only

## Project Layout

- `backend/`: FastAPI app and shared workspace-builder logic
- `frontend/`: React/Vite UI
- `scripts/runtime_manager.py`: registry-aware startup orchestration
- `config/`: local example configs
- `configs/`: portable starter configs
- `tools/`: CLI entrypoints

## Verification

```bash
python3 -m pytest backend/tests -q
python3 -m ruff check backend scripts tools
npm --prefix frontend install
npm --prefix frontend test
npm --prefix frontend run build
```
