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

## Phase 11

- added a governed task-packet assembly endpoint
- Build task packets now draw from:
  - snapshot bundles
  - persisted policy bundles
  - selected SLCS pieces
  - allowed and forbidden path scope
- this creates the first real handoff object for future deterministic or model-backed Build adapters

## Phase 12

- turned the adapter family into a real executable runner surface
- all declared adapters now execute behind one contract:
  - deterministic
  - cloud API
  - local server
  - local CLI
  - file-handshake
- added a shared run endpoint that returns:
  - the generated task packet
  - adapter capability metadata
  - a normalized result object
- current non-deterministic adapters are still informational stubs, but they now conform to the same execution interface

## Phase 13

- replaced the deterministic adapter stub with a real no-model planning path
- deterministic Build now produces:
  - a scoped plan
  - file actions
  - patch previews
  - a deterministic manifest artifact
- this gives the repo its first token-free governed Build flow based only on snapshot scope, policy, and selected pieces

## Phase 14

- added a scratch patch-preview gate for Build
- deterministic or future adapter results can now be materialized into:
  - a task packet artifact
  - a normalized result artifact
  - a patch bundle artifact
  - a validation report artifact
- the gate validates file actions against selected scope, allowed targets, and forbidden paths before anything is considered apply-ready

## Phase 15

- added scratch apply runs for patch previews
- apply now happens only inside scratch space, not the main repo
- each apply run now persists:
  - reconciliation report
  - apply summary
  - rollback directory
  - scratch apply directory
- after scratch apply, the app rescans the scratch workspace and records before/after notes as the first reconciliation loop

## Phase 16

- added the first parallel scan foundation in Python
- introduced:
  - source discovery with a thread pool
  - per-file profiling with a process pool
  - merged extension/size summaries
  - persisted parallel scan profile artifacts
- exposed a profiling endpoint so the parallel engine can be exercised and measured inside the app backend

## Phase 17

- added hash-aware file records to snapshot generation
- introduced a delta snapshot flow that compares the current scoped file hashes to an earlier snapshot bundle
- persisted delta snapshot artifacts and exposed them through the backend bootstrap and API
- this is the first real incremental comparison path instead of only storing full snapshot bundles

## Phase 18

- added a polling-based live monitor service
- live monitor now supports:
  - start
  - status
  - poll for created/modified/deleted files
  - flush debounced batches
- this gives the backend a real normalized change-event path before a fuller filesystem-watcher implementation

## Phase 19

- added a persisted Logic profile surface
- Logic profiles now extract in parallel:
  - imports
  - symbols
  - route hints
  - storage hints
- this is the first real semantic-linking layer for code-oriented Structure / Explain / Build follow-on work

## Phase 20

- added persisted Explain bundles
- Explain bundles now combine:
  - snapshot architecture summary
  - top files
  - top symbols
  - feature clusters
  - logic summary
- Build task packets can now carry an explain bundle reference and explain summary metadata

## Phase 21

- added a unified history timeline across:
  - snapshot bundles
  - delta snapshots
  - patch previews
  - apply runs
  - logic profiles
  - explain bundles
- added direct snapshot-bundle comparison so changes can be inspected without manually diffing artifacts on disk

## Phase 22

- refreshed the README to reflect the much larger v2 backend surface
- added a release-readiness checklist file for the current repo state
- captured what is verified now versus what still belongs in later product hardening
- added a run-and-tour guide
- added a Playwright smoke scaffold
- added a lightweight Electron desktop scaffold

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
