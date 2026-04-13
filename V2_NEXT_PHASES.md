# Context Vault Studio / Atlas V2 Next Phases

This file turns the latest v2 planning notes into an implementation roadmap for the real app.

The two new inputs were:

- `additional v2 plans.docx`
- `making atlas parallel.docx`

Together, they add two major tracks on top of the current app:

1. a governed `Build` system that works with cloud APIs, local models, CLI agents, or no model at all
2. a faster Python-native parallel scan and graph pipeline for live monitoring, snapshotting, and incremental analysis

## What Is Already Done

The current app already has:

- curated source selection
- preview and build
- access boundary rules
- Obsidian-style graph output
- a true WebGL 3D graph scene with search and render-cap behavior for large workspaces
- notes, canvas, bookmarks, snapshots
- guided demo onboarding
- background preview/build jobs

That means the next phases should build on the existing product instead of replacing it.

Update:

- Phases `9` through `22` in this document now have shipped first implementations in the repo.
- The remaining future work is mostly about deeper polish, richer UI exposure, and stronger productionization rather than missing backend foundations.

## Core V2 Direction

The v2 direction from the new notes is:

- Atlas should create snapshot bundles, not just a graph picture
- Build should govern model interaction externally through scope, schema, validation, and apply gates
- local-only operation must remain possible
- SLCS registry usage should reduce token cost and speed up app building
- the scan engine should become incremental and parallel so Structure, Logic, and Explain refresh quickly

## New Phase Set

### Phase 9
Snapshot Bundle Foundation

Goal:
- turn preview/build output into a reusable snapshot bundle

Deliverables:
- snapshot metadata file
- file manifest artifact
- edge artifact
- feature cluster artifact
- architecture summary artifact
- policy bundle artifact
- optional SLCS context artifact

Why this phase matters:
- Build, Explain, and later adapters should consume a scoped snapshot bundle instead of raw repo state

### Phase 10
Formal Build Adapter Contract

Goal:
- define one stable contract between the app and any model backend

Deliverables:
- `BuildRequest` schema
- `AdapterCapabilities` schema
- `BackendTaskPacket` schema
- `NormalizedBuildResult` schema
- `ValidationReport` schema
- `ReconciliationReport` schema

Why this phase matters:
- Build should talk to adapters, not directly to Claude, Codex, Ollama, or any single provider

### Phase 11
Governed Build Packet Pipeline

Goal:
- make Build assemble a real constrained task packet

Deliverables:
- goal capture
- scoped file slice
- allowed target files and folders
- forbidden paths
- selected SLCS pieces
- policy bundle
- required response schema

Why this phase matters:
- rules should be enforced by the execution envelope, not only by prompt text

### Phase 12
Model Adapter Family

Goal:
- support multiple backend types behind one interface

Deliverables:
- cloud API adapter
- local server adapter
- local CLI adapter
- file-handshake adapter

Why this phase matters:
- users should not need cloud APIs to benefit from Build

### Phase 13
Deterministic No-Model Build Mode

Goal:
- let Build work even with zero model usage for simple SLCS-driven tasks

Deliverables:
- deterministic builder adapter
- parameterized piece selection
- rule-based wiring
- manifest generation without token usage

Why this phase matters:
- this is the clearest path to lower token cost and faster app building

### Phase 14
Scratch Worktree and Patch Gate

Goal:
- make Build safe before any real apply workflow exists

Deliverables:
- scratch worktree or staging area
- patch-bundle generation
- allowed target validation
- import and dependency checks
- policy validation

Why this phase matters:
- models and generators should not write directly into the main repo without a gate

### Phase 15
Apply, Rescan, and Reconciliation

Goal:
- close the Build loop after preview and validation

Deliverables:
- apply to scratch or branch
- rollback handle
- post-apply Atlas rescan
- before/after reconciliation report
- updated Structure / Logic / Explain state

Why this phase matters:
- this is the first true end-to-end governed build workflow

### Phase 16
Parallel Scan Engine Foundation

Goal:
- speed up the app using Python-native concurrency

Deliverables:
- orchestrator
- parse worker pool
- merge engine
- artifact writer

Architecture rule:
- threads for watch/orchestration/I/O
- processes for parsing and heavy analysis
- single merge/write truth path

Why this phase matters:
- this makes the app feel faster before deeper v2 surfaces even land

### Phase 17
Incremental Snapshot and Diff Engine

Goal:
- stop rescanning everything on every change

Deliverables:
- manifest builder
- file hasher
- snapshot differ
- changed-file scope calculation
- full and delta snapshot model

Why this phase matters:
- live monitoring and faster rebuilds depend on this

### Phase 18
Live Monitor and Debounce

Goal:
- make the app respond to real repo changes cleanly

Deliverables:
- filesystem watcher
- debounce buffer
- normalized change events
- incremental refresh scheduling

Why this phase matters:
- this is the basis for a true history/timeline view later

### Phase 19
Parallel Semantic Linking

Goal:
- make Logic deeper and faster

Deliverables:
- parallel import resolution
- symbol extraction
- route tracing
- storage tracing
- feature cluster recompute
- affected-neighborhood rebuilds

Why this phase matters:
- better Logic makes Explain and Build better automatically

### Phase 20
Explain and Build Integration Upgrade

Goal:
- use snapshot and Logic outputs as first-class Build context

Deliverables:
- explanation bundle artifact
- evidence-first file and symbol summaries
- Build context bundle from Structure + Logic + Explain
- report and diagram hooks

Why this phase matters:
- Explain should become a real handoff layer, not just another view

### Phase 21
History and Timeline Views

Goal:
- expose changes over time, not just the latest graph

Deliverables:
- full snapshot history
- delta history
- changed/added/removed views
- graph-over-time comparison
- timeline-driven rebuilds

Why this phase matters:
- users asked for time-based understanding, not only a static graph

### Phase 22
Release Hardening

Goal:
- prepare the app for broader sharing

Deliverables:
- better docs and walkthroughs
- screenshots of the current UX
- e2e coverage for the guided demo and advanced flows
- packaging and release workflows

Why this phase matters:
- the new architecture should remain shareable, deterministic, and understandable

## Recommended Order

The best order from the two new notes is:

1. Phase 9
2. Phase 10
3. Phase 11
4. Phase 13
5. Phase 14
6. Phase 16
7. Phase 17
8. Phase 18
9. Phase 19
10. Phase 20
11. Phase 12
12. Phase 15
13. Phase 21
14. Phase 22

This order is intentional:

- first make snapshot/build governance real
- then make scanning and analysis faster
- then deepen adapters and apply workflows
- then finish history and release hardening

## Biggest Design Rules From The New Notes

These should remain non-negotiable:

1. Atlas/Build should enforce rules outside the model, not trust the model to obey them.
2. Build should work with cloud, local, CLI, and no-model modes through the same adapter contract.
3. Snapshot bundles should be the main handoff artifact between Structure, Logic, Explain, and Build.
4. The main repo should stay protected behind scratch worktree and validation gates.
5. Parallel workers should produce facts, but only one merge/write stage should produce truth.

## Best Immediate Next Step

If work starts now, the strongest next implementation phase is:

`Phase 9: Snapshot Bundle Foundation`

That phase unlocks:

- cleaner Build packets
- cleaner Explain bundles
- safer no-model and local-model operation
- better history
- easier future adapter support
