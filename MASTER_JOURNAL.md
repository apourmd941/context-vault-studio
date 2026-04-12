# Context Vault Studio Master Journal

## Intent

Turn the earlier Obsidian-style mapping prototype into a real shareable app with a frontend, backend, cross-platform startup flow, and a curated-workspace UX instead of a one-off script.

## Phase 1

- started from an empty workspace with only the first prototype script and local config example
- extracted the builder logic into a shared backend service
- kept a CLI wrapper so command-line and app workflows stay aligned

## Phase 2

- added a FastAPI backend with:
  - bootstrap loading
  - workspace config persistence
  - preview and build endpoints
  - path inspection
- added backend tests for preview/build and path inspection

## Phase 3

- added a React/Vite frontend
- designed it as an Obsidian-inspired dark workspace with sidebars, panes, note-like cards, and artifact panels
- focused the UI on source curation, preview, and build outputs instead of generic admin dashboards

## Phase 4

- added shared-registry startup support
- registered app id `context-vault-studio`
- recorded assigned ports `12045-12049`
- implemented cross-OS launcher scripts and Python runtime management

## Phase 5

- added an Obsidian-style graph view in the frontend
- exposed graph data directly from preview and build responses
- added backend-enforced access rules with:
  - allowed roots
  - blocked paths
  - blocked patterns
  - copy-only boundary enforcement

## Phase 6

- added background preview and build jobs
- added saved presets and build history
- added an in-app explorer, quick switcher, richer note preview, and link panels
- added frontend utility tests and open-source project metadata

## Phase 7

- added editable note preview with save and create flows
- added bookmarks, workspace layout persistence, and snapshot restore
- added canvas boards for draggable visual organization
- added export-bundle support for sharing built vaults

## Phase 8

- simplified the tab experience so `Vault`, `Notes`, `Canvas`, and `Graph` feel like different rooms instead of the same dashboard
- added a basic-first `Vault` home with a graph spotlight, essential actions, and clearer empty states
- moved the heavy source and boundary forms behind `Advanced mode`
- reduced sidebar noise by hiding empty bookmark, snapshot, job, and build-history panels
- added a bundled guided demo that previews and builds successfully out of the box
- verified the guided demo through the CLI dry-run path so the first-run experience is deterministic

## Phase 9

- added reusable snapshot bundles for preview and build runs
- each bundle now persists:
  - snapshot metadata
  - file manifest
  - graph edges
  - feature clusters
  - architecture summary
  - policy bundle
  - SLCS context placeholder
- exposed snapshot bundles through bootstrap and dedicated API endpoints
- surfaced the current snapshot bundle in the Vault result spotlight so future Explain / Build phases have a concrete handoff artifact

## Phase 10

- added formal Build adapter contract models for:
  - Build task requests
  - adapter capabilities
  - backend task packets
  - normalized build results
  - validation reports
  - reconciliation reports
- exposed adapter capabilities and contract schemas through API endpoints
- recorded the first adapter family as governed foundations:
  - deterministic
  - cloud API
  - local server
  - local CLI
  - file-handshake

## Verification

- `python3 -m py_compile` for the shared builder
- `python3 tools/build_context_workspace.py --config config/neutron_curated.example.json --dry-run`
- backend tests
- frontend production build

## Next Good Expansions

- import and export multiple named workspace presets from the UI
- graph visualization beyond counts and summaries
- richer source-type helpers for repos, manuals, and research folders
- packaged release workflows for easier sharing outside a dev terminal
