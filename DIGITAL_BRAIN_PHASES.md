# Digital Brain Phases

This file turns the `Digital brain.docx` blueprint into an implementation roadmap for Context Vault Studio.

## Product Definition

Digital Brain is the app's selective cognitive context layer.

It should not try to understand the whole computer equally. It should focus on approved, high-value sources and transform them into explainable context objects so the system can answer:

- what matters
- what something is about
- how it connects to current intent
- what was discussed or decided
- what project, note, chat, or memory a user likely means

Short version:

- `Structure` shows what exists
- `Digital Brain` shows what it means

## Product Rules

These rules are non-negotiable:

1. Digital Brain only deep-reads what has earned attention.
2. Approved scope first, broad ingestion later and only with explicit user consent.
3. Shallow-first indexing, then focused enrichment, then background improvement.
4. Every memory, edge, and surfaced result should carry provenance and confidence.
5. The graph must stay more selective and more explainable than the Structure lane.

## Current Baseline

The repo already has:

- a top-level `Digital brain` tab using the same shell as `Structure`
- a true WebGL graph renderer
- preview/build jobs
- snapshot bundles
- parallel worker budgeting
- file-analysis cache
- optional parallel output
- worker profiles, including an aggressive profile for `Digital brain`

That means implementation should begin from a functioning shell, not from zero.

## Core Data Direction

Digital Brain should evolve from a file graph into a cognitive graph.

### Primary node families

- `project`
- `chat`
- `message`
- `document`
- `note`
- `memory`
- `topic`
- `decision`
- `person`
- `task`
- `summary`
- `citation`

### Secondary node families

- `folder`
- `repo`
- `code module`
- `spreadsheet`
- `pdf`
- `email`
- `calendar event`
- `image`
- `audio transcript`
- `web capture`

### Early edge families

- `belongs_to`
- `about`
- `discussed_in`
- `related_to`
- `derived_from`
- `decided_in`
- `summarizes`
- `last_active_with`

## Implementation Phases

### Phase DB1
Digital Brain Shell and Setup

Goal:
- turn the duplicated shell into a real Digital Brain mode instead of a renamed Structure tab

Deliverables:
- Digital Brain-specific onboarding copy
- Digital Brain-specific subtab set
- Setup sections for:
  - priority sources
  - cognitive categories
  - scan mode
  - exclusions
  - graph density
  - enrichment mode
- persisted Digital Brain settings separate from Structure lane defaults

Suggested initial subtabs:
- `Setup`
- `Focus`
- `Memory`
- `Timeline`
- `Decisions`
- `Saved Graphs`
- `Advanced`

Success condition:
- Digital Brain can be configured independently from Structure
- the UI language is cognitive, not structural

### Phase DB2
Surface Pass Cognitive Graph

Goal:
- produce a fast first Digital Brain graph from shallow metadata only

Deliverables:
- Digital Brain surface-pass pipeline
- graph-shell node creation for:
  - projects
  - documents
  - notes
  - chats
  - memories
  - topics
- cognitive ranking rules that prioritize:
  - recent items
  - pinned items
  - active workspaces
  - notes/chats
- graph filters tuned for meaning instead of file topology

What to read in this phase:
- filenames
- paths
- timestamps
- titles
- top-level metadata
- cheap headings
- recent chat titles and summaries

Success condition:
- user gets a usable Digital Brain graph quickly without a deep scan

### Phase DB3
Selective Ingestion Policy

Goal:
- make Digital Brain selective by design, not by accident

Deliverables:
- approved-source registry for Digital Brain
- source classes:
  - approved workspaces
  - pinned folders/files
  - notes
  - chats
  - recent files
  - saved graphs
- attention eligibility rules
- score for why something deserves deeper reading
- explicit controls for:
  - recent-file priority
  - pinned-folder priority
  - project priority

Success condition:
- Digital Brain only deepens high-value scope
- it does not behave like a broad disk crawler

### Phase DB4
Focused Semantic Pass

Goal:
- enrich only the items that have earned attention

Deliverables:
- deeper parsing for selected files/chats/notes
- extracted signals:
  - summary
  - topic labels
  - named entities
  - project membership
  - decision candidates
  - unresolved questions
  - action items
- selective semantic edges
- confidence and provenance for extracted relationships

Success condition:
- important items become meaning-rich while low-value items remain lightweight

### Phase DB5
Focus Engine

Goal:
- resolve likely user intent into a small attention subgraph

Deliverables:
- intent parser
- anchor resolution using:
  - active project
  - recent files
  - recent chats
  - pins
  - memory aliases
  - titles and headings
- candidate ranking pipeline
- Focus subgraph view
- `Why this is shown` explanation panel

Example resolution targets:
- "that grant draft"
- "the smart implant discussion"
- "the paper where we talked about PROM correlation"
- "the thing Raja and I discussed"

Success condition:
- Digital Brain helps resolve what the user means, not only what words match

### Phase DB6
Memory Layer

Goal:
- introduce explicit memory classes instead of one undifferentiated memory store

Deliverables:
- memory classes:
  - episodic
  - semantic
  - procedural
  - relational
  - working
- memory node schema
- memory promotion suggestions
- user controls for:
  - confirm
  - demote
  - remove
- provenance and confidence tiers:
  - confirmed
  - strongly inferred
  - weakly inferred
  - suggested only

Success condition:
- memory becomes useful and inspectable without feeling hallucinated

### Phase DB7
Timeline and Decisions

Goal:
- let users trace how ideas, files, chats, and decisions evolved

Deliverables:
- Timeline tab
- Decision tab
- event linking between chats, notes, and files
- decision candidates with evidence chains
- timeline grouping by:
  - project
  - topic
  - session
  - recent activity

Success condition:
- user can see how a topic emerged and what decisions followed

### Phase DB8
Attention Cache and Background Enrichment

Goal:
- make Digital Brain feel alive and fast during active use

Deliverables:
- attention cache for:
  - active project
  - recent topics
  - recent docs
  - recent chats
  - pinned items
  - last resolved clusters
- background enrichment workers for:
  - better summaries
  - deduping
  - stronger topic clustering
  - richer relationship discovery
  - timeline refinement
  - decision refinement

Success condition:
- Focus view feels immediate while enrichment continues safely in the background

### Phase DB9
Digital Brain Graph Projections

Goal:
- stop treating Digital Brain as one giant graph view

Deliverables:
- Focus view
- Memory view
- Timeline view
- Decision view
- saved cognitive views
- graph density modes:
  - concise
  - balanced
  - rich

Behavior differences from Structure:
- fewer visible nodes
- stronger clustering
- clearer labels
- confidence-biased edges
- visible reasons for surfaced nodes

Success condition:
- Digital Brain feels curated and cognitive instead of dense and topological

### Phase DB10
Neutron Orb Integration

Goal:
- make the orb the live visual form of working attention

Deliverables:
- center node for current intent
- inner ring for top context objects
- middle ring for strong associated items
- outer ring for lower-priority candidates
- orb states:
  - idle
  - listening
  - resolving
  - confident
  - uncertain
  - answered

Success condition:
- orb behavior becomes functional and tied to the focus engine

### Phase DB11
Bridge to Explain and Build

Goal:
- turn Digital Brain into a first-class context handoff layer

Deliverables:
- pass context clusters into Explain
- pass active project, relevant docs, recent decisions, and linked notes into Build
- evidence-first summaries for downstream agents
- controlled context packets derived from Digital Brain neighborhoods

Success condition:
- Digital Brain improves Explain and Build instead of living as an isolated retrieval layer

### Phase DB12
Connector Expansion and Production Hardening

Goal:
- widen source coverage carefully while preserving trust

Deliverables:
- optional connectors for:
  - email
  - calendar
  - browser captures
  - reference libraries
- better observability:
  - cache hit rate
  - active worker budget
  - enrichment progress
  - confidence distributions
- stronger tests for:
  - selective ingestion
  - memory provenance
  - ranking explanations
  - focus resolution

Success condition:
- Digital Brain is robust, explainable, and ready for broader daily use

## Recommended Build Order

The best practical order from the current repo state is:

1. `DB1` Shell and Setup
2. `DB2` Surface Pass Cognitive Graph
3. `DB3` Selective Ingestion Policy
4. `DB5` Focus Engine
5. `DB4` Focused Semantic Pass
6. `DB6` Memory Layer
7. `DB7` Timeline and Decisions
8. `DB8` Attention Cache and Background Enrichment
9. `DB9` Graph Projections
10. `DB11` Bridge to Explain and Build
11. `DB10` Neutron Orb Integration
12. `DB12` Connector Expansion and Hardening

This order favors shipping useful behavior early rather than overbuilding the cognitive model before the UI and retrieval loop are usable.

## V1 Cut

If we want a strict V1 Digital Brain, ship only:

- `DB1` Shell and Setup
- `DB2` Surface Pass Cognitive Graph
- `DB3` Selective Ingestion Policy
- `DB5` Focus Engine
- a light slice of `DB4` Focused Semantic Pass
- a light slice of `DB7` Decisions

That would already be enough to:

- link files, notes, chats, and projects
- rank likely relevant context
- explain why items were surfaced
- feel meaning-driven instead of file-driven

## Acceptance Criteria

Digital Brain V1 should succeed at these examples:

Example 1:
- user asks for "implant telemetry"
- system surfaces relevant chats, documents, project nodes, and topic clusters with reasons

Example 2:
- user enters Digital Brain from a project in Structure
- system shows linked conversations, notes, recent docs, and decisions

Example 3:
- user asks for "that draft where we mentioned PROM correlation"
- system ranks candidates by topic, recency, project relevance, chat linkage, and summaries

Example 4:
- first run on a large workspace remains usable because the surface graph appears early while deeper enrichment continues in background
