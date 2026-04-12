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
- persists reusable snapshot bundles with manifest, edge, cluster, policy, and architecture artifacts
- renders an Obsidian-style local graph in the UI
- exposes formal Build adapter contracts and capability metadata for future governed Build work
- can now assemble governed task packets from snapshot bundles, policy bundles, and selected SLCS pieces
- can now run those task packets through a common adapter runner, even before the adapters are fully configured
- includes a real deterministic no-model Build path that can generate a scoped plan, file actions, and manifest output without token use
- can now materialize deterministic Build results into a scratch patch-preview bundle with validation artifacts
- can now apply those patch previews into scratch space, rescan the result, and persist a reconciliation report without touching the main repo
- includes a first parallel scan foundation in Python with worker-counted profiling of scoped sources
- can now generate delta snapshots by hashing current scoped files and comparing them to an earlier snapshot bundle
- includes a polling-based live monitor with debounced change batches for scoped sources
- supports explorer, quick switcher, note preview, backlinks, and outgoing links
- runs preview and build work as background jobs with persisted history
- supports bookmarks, canvas boards, note editing, snapshots, and shareable export bundles
- enforces allow and block rules before preview, path inspection, and build
- persists the last workspace layout locally
- supports both `copy` and `symlink` modes

## Current UI Flow

The app now opens with a simpler `Vault` home first.

- `Vault`
  - basic mode by default
  - load a guided demo, add a source, preview, or build
  - advanced mode reveals the full source and boundary editor
- `Notes`
  - browse matched files
  - follow backlinks and outgoing links
  - edit files and bookmark them
- `Canvas`
  - arrange note and text cards on a board
- `Graph`
  - inspect the current local graph and jump back into notes
- current result also carries a reusable snapshot bundle for later Explain / Build-style workflows

The first recommended run is:

1. start the app
2. click `Load guided demo`
3. let preview populate the workspace
4. move into `Graph` or `Notes`
5. build the vault when you want the generated output on disk

## Guided Demo

This repo now includes a bundled guided demo that works without any Aidin-only paths.

- config: `configs/guided_demo.json`
- sample content: `demo/sample_workspace`

The guided demo is intentionally tiny so the first preview is immediate and the graph is easy to read.

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

## Product Surfaces

- `Vault`: source curation, access rules, preview/build orchestration
- `Notes`: explorer, quick switcher, preview, editing, backlinks, outgoing links
- `Canvas`: draggable board for linking important notes and files
- `Graph`: interactive local graph for vault exploration
- Sidebar utilities:
  - presets
  - bookmarks
  - build history
  - snapshots

## Project Layout

- `backend/`: FastAPI app and shared workspace-builder logic
- `frontend/`: React/Vite UI
- `scripts/runtime_manager.py`: registry-aware startup orchestration
- `config/`: local example configs
- `configs/`: portable starter configs
- `demo/`: bundled sample workspace for the guided demo
- `tools/`: CLI entrypoints

## Verification

```bash
python3 -m pytest backend/tests -q
python3 -m ruff check backend scripts tools
npm --prefix frontend install
npm --prefix frontend test
npm --prefix frontend run build
```
