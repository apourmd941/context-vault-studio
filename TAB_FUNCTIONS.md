# Tab Functions

This file explains the purpose of the major top-level tabs in Context Vault Studio and how they relate to each other.

## Core Idea

The tabs are not just different screens.
They represent different stages of turning raw files into usable, governed AI context.

Short version:

- `Structure` shows what exists and what is in scope
- `Digital Brain` starts turning that scope into meaning
- `Logic` extracts code-oriented signals
- `Explain` packages context into reusable understanding
- `Build` uses that governed context to plan and stage changes safely

## Structure

Structure is the approved workspace layer.

It answers questions like:

- what folders and files are included?
- what is blocked or excluded?
- what does the current workspace graph look like?
- what is connected to what at the file and note level?

### Why it matters

Structure is more than indexing.

Finder and search answer:

- where is the file?
- what matches this name or text?

Structure answers:

- what is the approved workspace?
- what belongs together?
- what should the AI see?
- what should it ignore?
- what is the safest, smallest, highest-signal context to operate on?

That matters because the main AI problem is usually not “can it open files,” but:

- can it get the right files
- in the right scope
- with the right boundaries
- without wasting tokens
- without touching the wrong things

### Benefit relative to Finder

Finder is human navigation.
Structure is machine-ready workspace curation.

It helps AI models by:

- reducing scope before the model starts reading
- enforcing allow/block rules
- creating reusable graph, manifest, and snapshot artifacts
- giving relationship hints instead of isolated files
- making runs reproducible through the same scoped workspace

### How it helps the rest of the app

`Logic`

- runs on the scoped workspace instead of the whole repo or whole disk
- gets cleaner imports, symbols, routes, and storage-touch signals

`Build`

- uses Structure as the governed boundary
- gets allowed targets and forbidden paths from the scoped workspace
- stages safer patch previews and apply runs

## Digital Brain

Digital Brain is the cognitive layer built on top of approved Structure scope.

It answers questions like:

- what matters here?
- what is this about?
- what should the system focus on first?
- what might be a memory, topic, or decision?
- what does the user probably mean right now?

### Current role

Right now, Digital Brain is in its early phases.

It already has:

- its own tab and subtab language
- its own setup controls
- canonical source adapter and index status
- a first surface-pass cognitive graph
- first-pass memory shells
- first-pass decision candidates

### Long-term role

Digital Brain should become the meaning and intent layer.

It is where:

- chats, notes, files, projects, and later connectors get linked
- memories are extracted with provenance
- decisions and topics become reusable graph objects
- intent-based retrieval becomes possible

Short version:

- Structure shows what exists
- Digital Brain shows what it means

## Logic

Logic is the code-mapping layer.

It answers questions like:

- what imports exist?
- what symbols are present?
- what route hints are visible?
- what storage systems does this code appear to touch?

Logic is useful when the workspace contains code and you want the system to understand the technical structure rather than just the file layout.

### What it produces

- logic profiles
- import counts
- symbol counts
- route hints
- storage-touch hints
- parallel scan performance info

### Why it matters

Logic gives the app a first pass at code understanding without needing a model to infer everything from scratch later.

## Explain

Explain is the understanding-packaging layer.

It answers questions like:

- what are the top files?
- what are the top symbols?
- what architecture summary should be carried forward?
- what context bundle should later tools reuse?

Explain takes the outputs of Structure, Logic, and snapshots and turns them into reusable explanation bundles.

### Why it matters

Explain is the bridge between raw graph structure and a reusable handoff artifact.

It is especially useful before Build, because it turns scattered context into a compact package.

## Build

Build is the governed change-planning and staging layer.

It answers questions like:

- what should be changed?
- what is allowed to be changed?
- what patch preview can be created safely?
- what happens if that preview is applied in scratch space?

### What it does

- creates deterministic patch previews
- validates scoped targets
- keeps work inside allowed paths
- applies previews into scratch space instead of the main repo
- records reconciliation artifacts

### Why it matters

Build is not just “generate code.”
It is the guarded execution layer that uses the context prepared by the earlier tabs.

## How They Work Together

The tabs form a pipeline:

1. `Structure`
   Define and govern what is in scope.

2. `Digital Brain`
   Start turning scoped material into cognitive objects and focus clusters.

3. `Logic`
   Extract code-oriented signals from the scoped workspace.

4. `Explain`
   Package relevant understanding into reusable bundles.

5. `Build`
   Use governed context to plan and stage changes safely.

## The Shortest Product Explanation

If someone asks what the tabs are for:

`Structure` maps the approved workspace.
`Digital Brain` links meaning across that workspace.
`Logic` maps code signals.
`Explain` packages understanding.
`Build` uses all of that context to make safer, more efficient changes.
