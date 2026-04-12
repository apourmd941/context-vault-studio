# Context Vault Studio Agent Context

This repo is the standalone app version of the earlier Obsidian-style mapping prototype. Its job is to help operators define a smaller, higher-signal AI-visible corpus before handing work to Claude, Codex, or similar agents.

## App Identity

- Name: `Context Vault Studio`
- App id: `context-vault-studio`
- Path: `/Users/aidin/NeutronDev/obsidien style mapping`
- Shared port registry block: `12045-12049`
- Backend port: `12045`
- Frontend port: `12046`
- Reserved ports: `12047-12049`

## Mission

Build a cross-platform local app that lets people:

- curate folders and files into an intentional AI workspace
- preview the match set before building
- generate an Obsidian-friendly vault for human navigation
- export graph and manifest artifacts for machine retrieval
- render an Obsidian-style graph map inside the UI
- enforce allow and block rules before any source is inspected or built
- share the tool with others without tying it to one repo layout

## Core Architecture

- Backend: FastAPI + Pydantic
- Frontend: React + Vite + plain CSS
- Shared builder: reusable backend service also exposed through the CLI wrapper
- Storage:
  - JSON app state in `data/app_state`
  - snapshot bundle artifacts under `data/app_state/snapshot_bundles`
  - generated vault artifacts under the chosen output directory

## Invariants

1. The generated vault is the AI boundary, not Obsidian itself.
2. `copy` mode means a hard curated boundary.
3. `symlink` mode is convenience-first and should be treated as looser isolation.
4. Source paths may be absolute or relative, but runtime behavior must resolve them deterministically.
5. Access policy allow/block rules must be enforced consistently by path inspection, preview, and build.
6. The backend and CLI builder must use the same workspace-build logic.
7. Startup and stop flows must stay inside the registry-assigned 5-port block.
8. Only verified app-owned processes may be killed during cleanup, except for reclaiming the app's own assigned registry ports.

## Runtime Surfaces

- Web UI:
  - basic-first vault home
  - advanced source editing
  - guided demo loading
  - deterministic snapshot-driven Build foundations in the backend
  - explorer and quick switcher
  - note preview
  - note editing and creation
  - bookmarks
  - snapshots
  - snapshot bundles
  - canvas boards
  - preview/build job tracking
  - graph view
  - path inspection
- API endpoints:
  - `GET /api/bootstrap`
  - `GET /api/presets`
  - `POST /api/presets`
  - `GET /api/bookmarks`
  - `POST /api/bookmarks`
  - `GET /api/layout`
  - `PUT /api/layout`
  - `GET /api/canvases`
  - `POST /api/canvases`
  - `GET /api/snapshots`
  - `GET /api/snapshot-bundles`
  - `GET /api/snapshot-bundles/{bundle_id}`
  - `GET /api/build-adapters/capabilities`
  - `GET /api/build-adapters/contracts`
  - `POST /api/build-adapters/task-packet`
  - `POST /api/build-adapters/run`
  - `GET /api/build-adapters/patch-previews`
  - `GET /api/build-adapters/patch-previews/{preview_id}`
  - `POST /api/build-adapters/patch-gate`
  - `GET /api/build-history`
  - `GET /api/jobs`
  - `POST /api/jobs`
  - `POST /api/preview`
  - `POST /api/build`
  - `PUT /api/workspace-config`
  - `POST /api/path-inspect`
  - `POST /api/file-preview`
  - `POST /api/file-save`
  - `POST /api/file-create`
  - `POST /api/export-bundle`
  - `GET /api/file-content`
- CLI:
  - `python3 tools/build_context_workspace.py --config ...`

## Startup Contract

- Use the shared localhost port registry at `127.0.0.1:11999`.
- `start.sh`, `stop.sh`, `start.ps1`, and `stop.ps1` are the main operator entrypoints.
- `.app.pid` is authoritative for app-owned child processes.
- Dynamic frontend runtime config lives in `frontend/vite.config.dynamic.json` during execution and should be cleaned up on stop.

## Verification Defaults

- Backend tests: `pytest backend/tests -q`
- Backend lint: `ruff check backend scripts tools`
- Frontend tests: `npm --prefix frontend test`
- Frontend build: `npm --prefix frontend run build`

## Operator Notes

- The UI is intentionally Obsidian-inspired, not a literal clone.
- The bundled guided demo should remain portable and must not depend on Aidin-only absolute paths.
- Keep the first-run flow simple: the operator should be able to load the demo, preview, and reach Notes or Graph without editing low-level settings first.
- Keep the app shareable: avoid hard-wiring it to Aidin-only paths except in optional local example configs.
- If you widen the builder scope, preserve the narrow-fast path for small curated runs.
