# Canvas Phases

This file turns the current Canvas work into an implementation roadmap for completing the Canvas function inside Context Vault Studio.

## Product Definition

Canvas is the app's operator thinking surface.

It is where a user should be able to:

- pull important files, folders, notes, and graph items into one board
- spatially group and compare related items
- annotate the workspace with questions, decisions, risks, and next steps
- turn a board or selection into governed Logic, Explain, Build, or Digital Brain work
- preserve that board over time as part of the model history

Short version:

- `Graph` shows structure
- `Notes` shows content
- `Canvas` shows intent

## Product Rules

These rules should stay true as Canvas evolves:

1. Canvas must stay grounded in the approved workspace, not become a free-floating whiteboard with no provenance.
2. A canvas board should be able to hand off real scoped work to `Logic`, `Explain`, `Build`, and `Digital Brain`.
3. Canvas state must be saveable, restorable, and exportable.
4. A user should be able to understand what a board means without reading implementation details.
5. Canvas should reward spatial thinking, not force linear form entry.

## Current Baseline

The repo already has:

- multiple canvas boards
- file cards, note cards, and group cards
- card drag and resize
- board pan and zoom
- directional links with editable labels and colors
- file tray with recent and bookmarked files
- Notes-to-Canvas and Graph-to-Canvas handoff
- board-scoped actions for:
  - `Run logic on this`
  - `Explain this scope`
  - `Use in Build`
  - `Patch preview now`
- saved reusable scopes
- board templates
- board import and export
- board state snapshots and restore
- board-state comparison summaries plus mini board previews
- undo/redo
- optional autosave
- local draft recovery
- minimap-style board map with viewport indicator
- Build-scope save as preset
- native Digital Brain memory/decision record promotion and review

That means Canvas is already useful.

The remaining work is about finishing the workflow, hardening it, and turning promoted canvas artifacts into first-class system records.

## Implementation Status Snapshot

Current phase status:

- `CV1` complete
- `CV2` complete
- `CV3` complete
- `CV4` complete
- `CV5` complete
- `CV6` complete
- `CV7` complete
- `CV8` complete
- `CV9` complete
- `CV10` complete

What is already done:

- Canvas is a real multi-board surface, not a placeholder
- boards can be created, duplicated, deleted, imported, exported, saved, and restored
- boards support note cards, file cards, group cards, links, lasso selection, snapping, alignment, minimap navigation, and keyboard movement
- scopes can drive `Logic`, `Explain`, `Build`, patch preview, presets, and Digital Brain promotion
- board states can be saved, restored, and visually compared at a lightweight level
- native Digital Brain memory/decision records now exist and can be reviewed

What is still meaningfully remaining:

- no blocking Canvas roadmap items remain for the current V1 scope
- any future work is elective follow-on polish rather than unfinished Canvas phase work

## Canvas Completion Phases

### Phase CV1
Board Foundation

Goal:
- make Canvas a dependable board instead of a placeholder view

Status:
- largely done

Delivered baseline:
- board creation
- card editing
- groups
- links
- save/load
- import/export
- board state snapshots

Success condition:
- a user can build and save a real working board without leaving the app

### Phase CV2
Rich Spatial Interaction

Goal:
- make Canvas feel like a real board, not a simple card list

Status:
- complete

Delivered:
- drag
- resize
- pan
- zoom
- lasso selection
- snap guides
- alignment tools
- multi-card movement as one cluster
- multi-card resize from shared bounds
- better edge routing with directional anchors and curves
- minimap-style board map with viewport navigation
- keyboard shortcuts for:
  - undo/redo
  - select all
  - nudge movement
  - zoom
  - center board
  - add group
  - add note

Success condition:
- moving and arranging a board feels intentional and fast

### Phase CV3
Selection and Scope Engine

Goal:
- make board selections become real governed scopes

Status:
- complete

Delivered baseline:
- file-card scope
- group-card scope
- multi-selection scope
- board-wide scope
- scope handoff into Logic, Explain, and Build

Delivered completion:
- scope health checks
- `why this scope` explanation in the UI
- richer scope metadata carried into saved scopes and Build handoff

Success condition:
- any meaningful board selection can become a reusable scoped work packet

### Phase CV4
Templates and Reuse

Goal:
- make users faster by starting from known board patterns

Status:
- complete

Delivered baseline:
- system templates
- user templates
- save current board as template
- update/delete templates
- preview thumbnails

Delivered completion:
- richer template metadata
- template categories
- workflow and lane specialization metadata
- default starter templates per workflow

Success condition:
- users can start common board workflows from reusable structures instead of from zero

### Phase CV5
Board Time and History

Goal:
- make Canvas a time-aware artifact, not just a current screen

Status:
- complete

Delivered baseline:
- board-state snapshots
- restore support
- timeline visibility for `canvas_state`
- mini board compare previews
- changed-card label summaries
- board milestone labels
- optional automatic board-state snapshots on manual save
- board-linked activity visibility for saved scopes, patch previews, and apply runs

Delivered completion:
- current-board vs latest-snapshot change review
- board-linked activity visibility across scopes, patch previews, and apply runs
- milestone naming and automatic board-state snapshots on save

Success condition:
- the user can understand how a board changed over time, not just restore it blindly

### Phase CV6
Scope Comparison and Review

Goal:
- let users compare thought structures and working scopes directly

Status:
- complete

Delivered baseline:
- saved scope comparison by file membership
- board-state comparison summaries
- visual mini left/right board previews
- changed-card labels for added/removed/moved/edited cards
- saved-scope comparison by:
  - selected card labels
  - note-card deltas
  - group-card deltas
  - link deltas
  - build-goal changes

Delivered completion:
- stronger review checklist before handoff into Build
- richer saved-scope comparison beyond file membership

Success condition:
- a user can compare candidate boards/scopes without mental bookkeeping

### Phase CV7
Native Build Integration

Goal:
- turn Canvas from a planning board into a first-class Build control surface

Status:
- complete

Delivered baseline:
- board-scoped Build handoff
- direct patch preview from Canvas
- active canvas-derived scope in Build
- save scope as a true Build preset
- quick reuse of saved scopes from Build
- board-level build goals
- board-level allowed targets and forbidden paths
- board-linked patch preview and apply history summaries

Delivered completion:
- board-linked patch preview ownership
- board-linked apply ownership
- latest build summary from the board itself

Success condition:
- a board can become a repeatable Build entrypoint, not just an informal scope chooser

### Phase CV8
Native Digital Brain Integration

Goal:
- move promoted board artifacts into the real Digital Brain model

Status:
- complete

Delivered baseline:
- native stored memory records
- native stored decision records
- native stored topic records
- native stored task records
- provenance notes
- confidence fields
- review status
- promotion into Digital Brain tabs
- selection of promoted records back into Digital Brain context

Delivered completion:
- promotion to topic, memory, decision, and task
- board-linked Digital Brain records visible from Canvas
- Digital Brain records can reopen their originating board context

Success condition:
- Canvas can create first-class Digital Brain objects, not only bookmark-backed placeholders

### Phase CV9
Portable Artifacts and Sharing

Goal:
- make boards portable and reusable outside one running session

Status:
- complete

Delivered baseline:
- export board JSON
- import board JSON
- export linked board artifact metadata
- restore from portable board JSON
- export linked saved scopes and linked Digital Brain records
- import linked scope metadata and promoted records onto the imported board
- package format versioning and import-version validation

Delivered completion:
- linked-scope export packets
- linked Digital Brain record packaging
- import validation and rename-on-conflict handling
- package versioning for current portable board format

Success condition:
- a board can move between workspaces or users without becoming ambiguous or broken

### Phase CV10
Polish and Production Hardening

Goal:
- finish the experience so Canvas feels professional, stable, and trustworthy

Status:
- complete

Delivered completion:
- backend coverage for import/export/snapshot flows
- canvas utility coverage for scope and metadata behavior
- failed-save recovery and local draft recovery
- responsive smaller-screen behavior already in the Canvas layout
- production-ready review, history, and board-ownership surfaces

Success condition:
- Canvas feels production-ready, not experimental

## Recommended Implementation Order From Here

1. Treat future Canvas changes as follow-on enhancements rather than unfinished phase work

## Completion Standard

Canvas should be considered complete for a strong V1 when all of these are true:

- a user can create, edit, save, restore, and export boards
- a user can make reusable templates and reusable scopes
- a board selection can drive Logic, Explain, and Build directly
- board states can be compared over time
- promoted canvas artifacts become native Digital Brain records
- the board interaction model feels stable, fast, and professional

## Shortest Explanation

If someone asks what Canvas is supposed to become:

Canvas is the place where approved context becomes human-guided intent, reusable scopes, and durable decisions.
