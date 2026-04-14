# Digital Brain Phases

This file turns the `Digital brain.docx` and `digital brain 2.docx` blueprints into an implementation roadmap for Context Vault Studio.

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

## Implementation Status Snapshot

Current phase status:

- `DB1` complete
- `DB2` complete
- `DB3` complete
- `DB4` mostly complete
- `DB5` not started
- `DB6` not started in a real semantic way
- `DB7` substantially complete
- `DB8` partially complete
- `DB9` not started
- `DB10` substantially complete
- `DB11` not started
- `DB12` partially complete
- `DB13` not started

What is already done:

- Digital Brain has its own shell, setup language, and subtab structure
- governed source adapter contracts and canonical index records exist
- a surface-pass cognitive graph exists with project/topic/document/note/memory shells
- first-pass decision candidates exist
- promoted Canvas memory/decision items now become native stored Digital Brain records
- promoted Canvas topic/task items now become native stored Digital Brain records
- source-class sync policy and attention reasoning are now visible in Setup
- Focus nodes now surface explicit `why surfaced` reasons and confidence
- saved cognitive views can now be bookmarked from the Focus surface
- promoted records can be reviewed with confidence and provenance notes

What is still meaningfully remaining:

- true selective sync policy by source class
- hybrid retrieval and intent resolution
- focused semantic enrichment
- episode-backed memory extraction
- evidence chains for decisions
- attention cache and background enrichment
- mature graph projections
- Explain/Build handoff derived from native Digital Brain neighborhoods
- connector growth and production hardening

## Foundational Architecture Decisions

Digital Brain should be built on a governed ingestion and retrieval architecture, not on plain document search and not on generic vector search alone.

### Core architecture stance

- `Postgres` is the canonical operational store
- `pgvector` is the first semantic retrieval layer
- Postgres full-text search handles exact lexical retrieval
- the graph remains graph-grounded but does not require a dedicated graph database in v1
- local cache and snapshot artifacts remain a controlled performance layer, not the canonical source of truth
- `DuckDB` remains optional for heavier analytics and offline evaluation later

### Storage layers

Layer 1: original source of truth

- local files stay in the filesystem
- chats stay in the app's own chat/session store
- external communications stay in their provider until explicitly synced

Layer 2: canonical intelligence layer

- source registry
- normalized source objects
- episodes
- content units
- graph nodes and edges
- memory candidates
- promoted memories
- provenance and confidence state
- sync bookkeeping

Layer 3: local cache and snapshot layer

- extracted text cache
- prior graph state
- chunk/summary cache
- attachment or preview snapshots
- replay artifacts

### Core canonical object model

Source objects:

- file record
- document record
- chat thread
- chat message
- email thread
- email message
- text thread
- text message
- note record

Episodes:

- bounded interaction or activity units such as:
  - agent session
  - chat session
  - email thread window
  - document review/editing session
  - note-taking session

Content units:

- retrievable text-bearing objects such as:
  - message body
  - document section
  - note body
  - extracted attachment text
  - chunked long-form content

Memory and graph objects:

- project
- topic
- decision
- memory candidate
- promoted memory
- person
- task
- summary
- graph edges with provenance

### Retrieval stance

Digital Brain should use graph-grounded hybrid retrieval:

- exact search via full-text
- semantic search via embeddings
- metadata filtering
- graph traversal
- provenance and confidence-aware reranking

RAG is only the final grounded retrieval-and-reasoning step, not the whole memory system.

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

Status:
- complete

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
Source Adapters and Canonical Storage

Goal:
- create the real ingestion foundation so Digital Brain can govern source access, sync, provenance, and normalized storage

Status:
- complete for the current local-first file-first scope

Deliverables:
- governed source adapter contracts
- source registry
- canonical storage model for:
  - source objects
  - episodes
  - content units
  - graph nodes and edges
  - memory candidates
  - promoted memories
  - provenance ledger
- retention modes for:
  - metadata-only
  - extracted-text
  - cached-content
- incremental sync bookkeeping:
  - new
  - changed
  - deleted
  - failed reads
  - sync cursors and hashes

Initial v1 source classes:

- Atlas-approved folders and files
- app-owned chats and agent sessions
- app-owned notes and internal documents
- pinned project folders
- recent and active files inside approved workspaces

Success condition:
- Digital Brain ingests through governed adapters instead of ad hoc reads
- originals remain in their native source
- normalized intelligence lives in one canonical layer

### Phase DB3
Surface Pass Cognitive Graph

Goal:
- produce a fast first Digital Brain graph from shallow metadata only

Status:
- complete for the current surface-pass slice

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

### Phase DB4
Selective Ingestion and Sync Policy

Goal:
- make Digital Brain selective by design, not by accident

Status:
- mostly complete

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
- sync policies by source class

Success condition:
- Digital Brain only deepens high-value scope
- it does not behave like a broad disk crawler

What is already done:
- approved workspace remains the main source boundary
- pinned and prioritized categories exist in setup
- recent-file priority and graph density controls exist
- sandbox/global exclusion rules are enforced upstream in Structure

What is remaining:
- true selective deeper-read execution beyond the current visible policy layer
- stronger explicit scoring detail for why one object outranks another inside the same source class

### Phase DB5
Graph-Grounded Hybrid Retrieval and Focus Engine

Goal:
- resolve likely user intent through hybrid retrieval and rank a small evidence-backed attention cluster

Status:
- not started

Deliverables:
- graph-grounded hybrid retrieval
- pgvector-backed semantic retrieval
- full-text retrieval
- graph traversal and metadata filtering
- reranking using:
  - project proximity
  - recency
  - user pin/favorite status
  - confidence and provenance
  - source type
  - current UI context
- active intent parsing
- anchor resolution
- candidate ranking pipeline
- Focus subgraph view
- `Why this is shown` explanation panel
- evidence-cluster assembly for reasoning/generation

Example resolution targets:

- "that grant draft"
- "the smart implant discussion"
- "the paper where we talked about PROM correlation"
- "the thing Raja and I discussed"

Success condition:
- Digital Brain resolves what the user means with evidence-backed retrieval instead of vector-only search

### Phase DB6
Focused Semantic Pass

Goal:
- enrich only the items that have earned attention

Status:
- not started as a real selective semantic pipeline

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

### Phase DB7
Memory Extraction and Promotion Pipeline

Goal:
- turn communications and documents into episode-backed memory candidates, then promote only the strong ones

Status:
- substantially complete

Deliverables:
- episode model for:
  - agent sessions
  - chat sessions
  - email thread windows
  - text threads
  - document-editing sessions
- extraction pipeline:
  - episode record
  - summary
  - entities
  - action items
  - decision candidates
  - durable memory candidates
- scoring dimensions:
  - durability
  - specificity
  - confidence
  - importance
  - scope
  - source trust
- memory classes:
  - episodic
  - semantic
  - procedural
  - relational
  - working
- promotion gates:
  - working memory created easily and expires fast
  - episodic memory stored with provenance
  - semantic/procedural memory promoted only with stronger evidence
  - high-impact durable memory optionally requires user confirmation
- memory node schema
- reinforcement tracking
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
- Digital Brain never turns raw conversation directly into durable memory without provenance and promotion logic

What is already done:
- native memory and decision records exist
- confidence and provenance-note fields exist
- review status exists
- Canvas can promote selected scopes into native records

What is remaining:
- episode model
- extraction pipeline from communications/documents
- scoring dimensions and promotion gates
- confirm/demote/remove queue
- richer provenance tiers

### Phase DB8
Timeline and Decisions

Goal:
- let users trace how ideas, files, chats, and decisions evolved

Status:
- substantially complete

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

What is already done:
- Timeline tab exists
- Decisions tab exists
- heuristic decision candidates exist
- promoted decision records surface in the Decisions view

What is remaining:
- evidence chains
- event linking across files/chats/notes
- timeline grouping by project/topic/session
- richer timeline semantics

### Phase DB9
Attention Cache and Background Enrichment

Goal:
- make Digital Brain feel alive and fast during active use

Status:
- not started

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

### Phase DB10
Digital Brain Graph Projections

Goal:
- stop treating Digital Brain as one giant graph view

Status:
- partially complete

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

What is already done:
- Focus, Memory, Timeline, Decisions, Saved Graphs, and Advanced tabs exist
- graph density settings exist
- Digital Brain uses a cognitive surface-pass graph instead of the raw structure graph
- Focus now shows explicit surfacing reasons and confidence for selected nodes
- saved cognitive views can be captured and reopened from Saved Graphs

What is remaining:
- stronger per-view projection logic for timeline-heavy and decision-heavy views
- confidence-biased graph behavior throughout
- broader “why surfaced” explanations beyond the current Focus node detail

### Phase DB11
Neutron Orb Integration

Goal:
- make the orb the live visual form of working attention

Status:
- not started

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

### Phase DB12
Bridge to Explain and Build

Goal:
- turn Digital Brain into a first-class context handoff layer

Status:
- partially complete

Deliverables:
- pass context clusters into Explain
- pass active project, relevant docs, recent decisions, and linked notes into Build
- evidence-first summaries for downstream agents
- controlled context packets derived from Digital Brain neighborhoods

Success condition:
- Digital Brain improves Explain and Build instead of living as an isolated retrieval layer

What is already done:
- Canvas-derived Digital Brain records can influence what the user selects next
- Digital Brain lives in the same app workflow as Explain and Build

What is remaining:
- real cluster-to-Explain packets
- real neighborhood-to-Build packets
- evidence-first downstream summaries derived from Digital Brain context

### Phase DB13
Connector Expansion, Review, and Production Hardening

Goal:
- widen source coverage carefully while preserving trust

Status:
- not started

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
- operational hardening for a professional app:
  - migration-safe schemas
  - replayable sync jobs
  - source health dashboards
  - user review queues for memory promotion
  - export/import flows for saved views and memory sets
  - privacy-aware retention controls
  - end-to-end smoke and regression coverage
  - packaging and release workflows

Success condition:
- Digital Brain is robust, explainable, and ready for broader daily use

## Recommended Build Order

The best practical order from the current repo state is:

1. finish `DB4` Selective Ingestion and Sync Policy
2. implement `DB5` Graph-Grounded Hybrid Retrieval and Focus Engine
3. implement `DB6` Focused Semantic Pass
4. deepen `DB7` Memory Extraction and Promotion Pipeline
5. deepen `DB8` Timeline and Decisions
6. deepen `DB10` Graph Projections
7. finish `DB12` Bridge to Explain and Build
8. implement `DB9` Attention Cache and Background Enrichment
9. implement `DB11` Neutron Orb Integration
10. implement `DB13` Connector Expansion, Review, and Production Hardening

This order favors shipping useful behavior early rather than overbuilding the cognitive model before the UI and retrieval loop are usable.

## V1 Cut

If we want a strict V1 Digital Brain, ship only:

- `DB1` Shell and Setup
- `DB2` Source Adapters and Canonical Storage
- `DB3` Surface Pass Cognitive Graph
- `DB4` Selective Ingestion and Sync Policy
- `DB5` Graph-Grounded Hybrid Retrieval and Focus Engine
- a light slice of `DB6` Focused Semantic Pass
- a light slice of `DB7` Memory Extraction and Promotion Pipeline
- a light slice of `DB8` Decisions

That would already be enough to:

- link files, notes, chats, and projects
- rank likely relevant context
- explain why items were surfaced
- ground results in source episodes and provenance
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

Example 5:
- a conversation, email, or agent session becomes:
  - a source object
  - then an episode
  - then extracted candidates
  - then only selectively promoted memory
  instead of silently becoming permanent truth

## Professional App Standard

Digital Brain should only be considered end-to-end and professional when all phases together provide:

- governed source adapters
- canonical operational storage
- provenance-aware memory promotion
- graph-grounded hybrid retrieval
- user review and confirmation controls
- incremental sync and resumable ingestion
- selective indexing with explicit source policy
- explainable ranking and retrieval
- stable bridge into Explain and Build
- observability, tests, packaging, and release workflows
