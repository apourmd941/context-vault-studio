import { Suspense, lazy, startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";

import BookmarkPanel from "./BookmarkPanel";
import CanvasBoard from "./CanvasBoard";
import ExplorerPane from "./ExplorerPane";
import {
  applyPatchPreview,
  compareHistorySnapshots,
  createBookmark,
  createCanvas,
  createCanvasSnapshot,
  createCanvasTemplate,
  createDigitalBrainRecord,
  createFile,
  deleteCanvasTemplate,
  createJob,
  createDeltaSnapshot,
  createExplainBundle,
  chooseNativePath,
  createLogicProfile,
  createParallelScanProfile,
  createPatchPreview,
  createPreset,
  deleteCanvas,
  deletePreset,
  deleteDigitalBrainRecord,
  exportBundle,
  fetchBootstrap,
  fetchBuildHistory,
  fetchCanvasTemplates,
  fetchDigitalBrainRecords,
  fetchDigitalBrainIndex,
  fetchFilePreview,
  fetchHistoryTimeline,
  fetchJob,
  inspectPath,
  importCanvasBoard,
  restoreSnapshot,
  saveFile,
  saveLayout,
  saveWorkspaceConfig,
  updateCanvas,
  updateCanvasTemplate,
  updateDigitalBrainRecord,
  exportCanvasBoard,
} from "./api";
import PresetPanel from "./PresetPanel";
import PreviewPane from "./PreviewPane";
import QuickSwitcher from "./QuickSwitcher";
import SnapshotPanel from "./SnapshotPanel";
import { buildSavedScopeComparison } from "./lib/canvas";
import { buildAdjacency, buildFileTree, searchFiles } from "./lib/vault";
import { DEFAULT_WORKER_COUNT, workerCountForProfile, workerProfileForLane } from "./lib/workerPolicy";


const GraphMap = lazy(() => import("./GraphMap"));


const EMPTY_ACCESS = {
  allowed_roots: [],
  blocked_paths: [],
  blocked_patterns: [],
  enforce_copy_mode: true,
};

const DEFAULT_GLOBAL_BLOCK_PATTERNS = [
  ".DS_Store",
  "Thumbs.db",
  ".git/**",
  ".pytest_cache/**",
  ".ruff_cache/**",
  ".venv/**",
  ".vscode/**",
  "__pycache__/**",
  "node_modules/**",
];

const RECOMMENDED_GLOBAL_BLOCK_PATTERNS = [
  ...DEFAULT_GLOBAL_BLOCK_PATTERNS,
  "dist/**",
  "build/**",
  ".next/**",
  "coverage/**",
  ".mypy_cache/**",
  "*.log",
];

const EMPTY_GLOBAL_EXCLUSIONS = {
  blocked_paths: [],
  blocked_patterns: DEFAULT_GLOBAL_BLOCK_PATTERNS,
};

const EMPTY_SOURCE = {
  name: "",
  category: "Projects",
  path: "",
  include: [],
  exclude: [],
  mode: "copy",
  max_file_size_bytes: "",
};

const EMPTY_DIGITAL_BRAIN = {
  scan_mode: "quick_start",
  graph_density: "balanced",
  enrichment_mode: "background",
  retention_mode: "extracted_text",
  workspace_file_sync_policy: "metadata_then_focus",
  notes_sync_policy: "metadata_then_focus",
  chat_sync_policy: "planned",
  recent_activity_sync_policy: "ranking_only",
  prioritize_recent_files: true,
  include_notes: true,
  include_chats: true,
  priority_categories: ["conversations", "documents", "memories", "decisions", "topics"],
};

const EMPTY_MODEL_WORKFLOW = {
  auto_snapshot_after_build: true,
  auto_snapshot_after_refresh: true,
  auto_snapshot_on_monitored_changes: false,
  auto_snapshot_retention: 24,
};

const EXPLORE_SUB_TABS = [
  { id: "setup", label: "Setup" },
  { id: "graph", label: "Graph" },
  { id: "notes", label: "Notes" },
  { id: "canvas", label: "Canvas" },
  { id: "history", label: "History" },
  { id: "saved", label: "Saved Graphs" },
  { id: "advanced", label: "Advanced" },
];

const DIGITAL_BRAIN_SUB_TABS = [
  { id: "setup", label: "Setup" },
  { id: "focus", label: "Focus" },
  { id: "memory", label: "Memory" },
  { id: "timeline", label: "Timeline" },
  { id: "decisions", label: "Decisions" },
  { id: "saved", label: "Saved Graphs" },
  { id: "advanced", label: "Advanced" },
];

const DIGITAL_BRAIN_VIEW_MAP = {
  setup: "setup",
  focus: "graph",
  memory: "notes",
  timeline: "history",
  decisions: "decisions",
  saved: "saved",
  advanced: "advanced",
};

const DIGITAL_BRAIN_CATEGORY_OPTIONS = [
  { id: "conversations", label: "Conversations" },
  { id: "documents", label: "Documents" },
  { id: "memories", label: "Memories" },
  { id: "decisions", label: "Decisions" },
  { id: "topics", label: "Topics" },
  { id: "people", label: "People" },
  { id: "tasks", label: "Tasks" },
];

const NOTES_FILTERS = [
  { id: "all", label: "All" },
  { id: "docs", label: "Docs" },
  { id: "markdown", label: "Markdown" },
  { id: "code", label: "Code" },
  { id: "binary", label: "Binary" },
  { id: "recent", label: "Recent" },
  { id: "bookmarked", label: "Bookmarked" },
];

const MAIN_TABS = [
  { id: "structure", label: "Structure" },
  { id: "logic", label: "Logic" },
  { id: "explain", label: "Explain" },
  { id: "build", label: "Build" },
  { id: "digital-brain", label: "Digital brain" },
];

const SUB_TABS = {
  structure: EXPLORE_SUB_TABS,
  logic: [
    { id: "overview", label: "Overview" },
    { id: "signals", label: "Signals" },
    { id: "files", label: "Files" },
  ],
  explain: [
    { id: "overview", label: "Overview" },
    { id: "bundle", label: "Bundle" },
    { id: "history", label: "History" },
  ],
  build: [
    { id: "goal", label: "Goal" },
    { id: "preview", label: "Patch Preview" },
    { id: "apply", label: "Apply" },
    { id: "history", label: "History" },
  ],
  "digital-brain": DIGITAL_BRAIN_SUB_TABS,
};

const LANE_COPY = {
  structure: {
    eyebrow: "Structure mapper",
    title: "Map the files and folders you want the app to understand.",
    description:
      "Use Structure to choose allowed folders or disks, preview the graph, inspect notes, and review how the scoped workspace changes over time.",
  },
  "digital-brain": {
    eyebrow: "Digital brain",
    title: "Grow the same curated workspace into a reusable digital brain.",
    description:
      "Digital brain starts with the same mapping, graph, notes, canvas, and history tools as Structure so you can evolve the scoped workspace in a dedicated lane.",
  },
  logic: {
    eyebrow: "Code mapper",
    title: "See the code relationships the app can infer from the current scope.",
    description:
      "Logic turns the current scoped workspace into imports, symbols, route hints, storage hints, and feature-level code signals.",
  },
  explain: {
    eyebrow: "Code analyzer",
    title: "Package architecture context into reusable explanation bundles.",
    description:
      "Explain combines snapshot and logic information into top files, top symbols, and architecture summaries that Build can reuse.",
  },
  build: {
    eyebrow: "Governed build",
    title: "Plan and stage changes through deterministic or adapter-driven Build flows.",
    description:
      "Build works from snapshot, logic, and explain context. It generates scoped plans, patch previews, and scratch apply runs instead of writing directly to the main repo.",
  },
};


function splitLines(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}


function joinLines(values) {
  return (values ?? []).join("\n");
}


function normalizeSource(source = {}) {
  return {
    ...EMPTY_SOURCE,
    ...source,
    include: [...(source.include ?? EMPTY_SOURCE.include)],
    exclude: [...(source.exclude ?? EMPTY_SOURCE.exclude)],
    max_file_size_bytes: source.max_file_size_bytes ?? "",
  };
}


function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}


function buildScopedConfigFromFiles(baseConfig, files, selectedRelPaths) {
  const scopedSelection = new Set((selectedRelPaths || []).filter(Boolean));
  if (!scopedSelection.size) {
    return serializeConfig(baseConfig);
  }

  const selectedBySource = new Map();
  for (const file of files || []) {
    if (!scopedSelection.has(file.rel_path) || !file.source_name) {
      continue;
    }
    const bucket = selectedBySource.get(file.source_name) || [];
    bucket.push(file.rel_path);
    selectedBySource.set(file.source_name, bucket);
  }

  const scopedConfig = serializeConfig(baseConfig);
  scopedConfig.sources = scopedConfig.sources
    .filter((source) => selectedBySource.has(source.name))
    .map((source) => ({
      ...source,
      include: uniqueValues(selectedBySource.get(source.name) || []),
      exclude: [],
    }));
  return scopedConfig;
}


function createCanvasCardFromGraphNode(node, file, index = 0) {
  if (file) {
    return {
      id: crypto.randomUUID(),
      type: "file",
      label: file.label,
      path: file.original_path,
      file_id: file.id,
      text: file.summary || file.rel_path || "",
      note: node.summary || "",
      x: 140 + index * 22,
      y: 140 + index * 18,
      width: 340,
      height: 220,
      color: "violet",
      locked: false,
    };
  }

  const isGroupLike = node.type === "folder" || node.type === "source" || node.type === "project";
  return {
    id: crypto.randomUUID(),
    type: isGroupLike ? "group" : "text",
    label: node.label || node.name || node.rel_path || node.type,
    text: isGroupLike ? "" : node.summary || node.rel_path || node.path || "",
    note: isGroupLike ? `${node.summary || "Selected from graph"}\n${node.rel_path || node.path || ""}`.trim() : "",
    x: 120 + index * 20,
    y: 120 + index * 16,
    width: isGroupLike ? 460 : 320,
    height: isGroupLike ? 280 : 220,
    color: isGroupLike ? "amber" : "mint",
    locked: false,
  };
}


function buildCanvasTemplate(templateId) {
  const viewport = { x: 100, y: 80, zoom: 0.82 };
  if (templateId === "architecture-review") {
    return {
      name: "Architecture review board",
      description: "Organize core modules, risks, decisions, and open questions before deeper logic/explain work.",
      viewport,
      metadata: {
        workflow: "architecture-review",
        preferred_lane: "structure",
        template_category: "architecture",
        tags: ["architecture", "review", "risks"],
        snapshot_label: "Architecture review milestone",
      },
      cards: [
        { id: crypto.randomUUID(), type: "group", label: "Core modules", note: "Drop the most important files or folders here.", x: 80, y: 80, width: 520, height: 320, color: "amber", locked: false },
        { id: crypto.randomUUID(), type: "group", label: "Risks", note: "Known fragility, missing tests, or unclear ownership.", x: 680, y: 80, width: 420, height: 260, color: "rose", locked: false },
        { id: crypto.randomUUID(), type: "text", label: "Review goal", text: "What are we trying to understand about this system?", x: 120, y: 450, width: 320, height: 200, color: "mint", locked: false },
        { id: crypto.randomUUID(), type: "text", label: "Open questions", text: "List assumptions, unresolved paths, and unknowns here.", x: 500, y: 440, width: 360, height: 220, color: "slate", locked: false },
      ],
      edges: [],
    };
  }
  if (templateId === "build-plan") {
    return {
      name: "Build plan board",
      description: "Shape scoped build targets, constraints, outputs, and validation steps before creating patch previews.",
      viewport,
      metadata: {
        workflow: "build-plan",
        preferred_lane: "structure",
        template_category: "build",
        tags: ["build", "validation", "targets"],
        snapshot_label: "Build plan milestone",
      },
      cards: [
        { id: crypto.randomUUID(), type: "group", label: "Target files", note: "Pin the files this build should touch.", x: 90, y: 90, width: 500, height: 300, color: "amber", locked: false },
        { id: crypto.randomUUID(), type: "group", label: "Validation", note: "Tests, lint, and manual checks.", x: 700, y: 90, width: 420, height: 260, color: "mint", locked: false },
        { id: crypto.randomUUID(), type: "text", label: "Build goal", text: "Describe the exact improvement this scoped build should produce.", x: 120, y: 430, width: 360, height: 220, color: "violet", locked: false },
        { id: crypto.randomUUID(), type: "text", label: "Constraints", text: "Document what must not change.", x: 540, y: 430, width: 320, height: 220, color: "rose", locked: false },
      ],
      edges: [],
    };
  }
  return {
    name: "Research synthesis board",
    description: "Group sources, findings, decisions, and next actions into one thinking board.",
    viewport,
    metadata: {
      workflow: "research-synthesis",
      preferred_lane: "digital-brain",
      template_category: "research",
      tags: ["research", "synthesis", "findings"],
      snapshot_label: "Research synthesis milestone",
    },
    cards: [
      { id: crypto.randomUUID(), type: "group", label: "Sources", note: "Collect notes, specs, manuals, and docs.", x: 80, y: 80, width: 460, height: 300, color: "amber", locked: false },
      { id: crypto.randomUUID(), type: "group", label: "Findings", note: "Pull the strongest observations into one cluster.", x: 610, y: 80, width: 460, height: 300, color: "mint", locked: false },
      { id: crypto.randomUUID(), type: "text", label: "Decisions", text: "Capture what we are actually choosing to do.", x: 140, y: 430, width: 340, height: 220, color: "violet", locked: false },
      { id: crypto.randomUUID(), type: "text", label: "Next steps", text: "What should happen after this board is clear?", x: 560, y: 430, width: 320, height: 220, color: "slate", locked: false },
    ],
    edges: [],
  };
}


function syncAccessWithFolders(config) {
  const folderPaths = uniqueValues((config.sources ?? []).map((source) => source.path?.trim()).filter(Boolean));
  return {
    ...config,
    access: {
      ...EMPTY_ACCESS,
      ...(config.access ?? {}),
      allowed_roots: folderPaths,
      blocked_paths: [...(config.access?.blocked_paths ?? EMPTY_ACCESS.blocked_paths)],
      blocked_patterns: [...(config.access?.blocked_patterns ?? EMPTY_ACCESS.blocked_patterns)],
    },
    global_exclusions: {
      ...EMPTY_GLOBAL_EXCLUSIONS,
      ...(config.global_exclusions ?? {}),
      blocked_paths: [...(config.global_exclusions?.blocked_paths ?? EMPTY_GLOBAL_EXCLUSIONS.blocked_paths)],
      blocked_patterns: [...(config.global_exclusions?.blocked_patterns ?? EMPTY_GLOBAL_EXCLUSIONS.blocked_patterns)],
    },
    digital_brain: {
      ...EMPTY_DIGITAL_BRAIN,
      ...(config.digital_brain ?? {}),
      priority_categories: [...(config.digital_brain?.priority_categories ?? EMPTY_DIGITAL_BRAIN.priority_categories)],
    },
    model_workflow: {
      ...EMPTY_MODEL_WORKFLOW,
      ...(config.model_workflow ?? {}),
    },
  };
}


function exploreViewForLaneTab(lane, tab) {
  if (lane !== "digital-brain") {
    return tab;
  }
  return DIGITAL_BRAIN_VIEW_MAP[tab] || "setup";
}


function exploreTabIdForView(lane, view) {
  if (lane !== "digital-brain") {
    return view;
  }
  return (
    Object.entries(DIGITAL_BRAIN_VIEW_MAP).find(([, targetView]) => targetView === view)?.[0] ||
    "setup"
  );
}


function createEmptyConfig() {
  return {
    vault_name: "Context Vault Studio",
    output_dir: "",
    default_mode: "copy",
    max_file_size_bytes: 5000000,
    default_exclude: [],
    default_include: [],
    access: { ...EMPTY_ACCESS },
    global_exclusions: { ...EMPTY_GLOBAL_EXCLUSIONS },
    digital_brain: { ...EMPTY_DIGITAL_BRAIN },
    model_workflow: { ...EMPTY_MODEL_WORKFLOW },
    sources: [],
  };
}


function normalizeConfig(config = {}) {
  const base = createEmptyConfig();
  return syncAccessWithFolders({
    ...base,
    ...config,
    access: {
      ...EMPTY_ACCESS,
      ...(config.access ?? {}),
      allowed_roots: [...(config.access?.allowed_roots ?? EMPTY_ACCESS.allowed_roots)],
      blocked_paths: [...(config.access?.blocked_paths ?? EMPTY_ACCESS.blocked_paths)],
      blocked_patterns: [...(config.access?.blocked_patterns ?? EMPTY_ACCESS.blocked_patterns)],
    },
    global_exclusions: {
      ...EMPTY_GLOBAL_EXCLUSIONS,
      ...(config.global_exclusions ?? {}),
      blocked_paths: [...(config.global_exclusions?.blocked_paths ?? EMPTY_GLOBAL_EXCLUSIONS.blocked_paths)],
      blocked_patterns: [...(config.global_exclusions?.blocked_patterns ?? EMPTY_GLOBAL_EXCLUSIONS.blocked_patterns)],
    },
    digital_brain: {
      ...EMPTY_DIGITAL_BRAIN,
      ...(config.digital_brain ?? {}),
      priority_categories: [...(config.digital_brain?.priority_categories ?? EMPTY_DIGITAL_BRAIN.priority_categories)],
    },
    model_workflow: {
      ...EMPTY_MODEL_WORKFLOW,
      ...(config.model_workflow ?? {}),
    },
    sources: (config.sources ?? []).map(normalizeSource),
  });
}


function serializeConfig(config) {
  const syncedConfig = syncAccessWithFolders(config);
  return {
    ...syncedConfig,
    output_dir: syncedConfig.output_dir || createEmptyConfig().output_dir,
    max_file_size_bytes: Number(syncedConfig.max_file_size_bytes) || 1,
    access: {
      ...syncedConfig.access,
      allowed_roots: [...(syncedConfig.access?.allowed_roots ?? [])],
      blocked_paths: [...(syncedConfig.access?.blocked_paths ?? [])],
      blocked_patterns: [...(syncedConfig.access?.blocked_patterns ?? [])],
      enforce_copy_mode: Boolean(syncedConfig.access?.enforce_copy_mode),
    },
    global_exclusions: {
      ...EMPTY_GLOBAL_EXCLUSIONS,
      ...(syncedConfig.global_exclusions ?? {}),
      blocked_paths: [...(syncedConfig.global_exclusions?.blocked_paths ?? [])],
      blocked_patterns: [...(syncedConfig.global_exclusions?.blocked_patterns ?? [])],
    },
    digital_brain: {
      ...EMPTY_DIGITAL_BRAIN,
      ...(syncedConfig.digital_brain ?? {}),
      priority_categories: [...(syncedConfig.digital_brain?.priority_categories ?? [])],
    },
    model_workflow: {
      ...EMPTY_MODEL_WORKFLOW,
      ...(syncedConfig.model_workflow ?? {}),
      auto_snapshot_retention: Number(syncedConfig.model_workflow?.auto_snapshot_retention) || EMPTY_MODEL_WORKFLOW.auto_snapshot_retention,
    },
    sources: syncedConfig.sources.map((source) => ({
      ...source,
      max_file_size_bytes:
        source.max_file_size_bytes === "" || source.max_file_size_bytes == null
          ? null
          : Number(source.max_file_size_bytes),
    })),
  };
}


function normalizeResult(result) {
  if (!result) {
    return null;
  }
  return {
    ...result,
    config: result.config ? normalizeConfig(result.config) : createEmptyConfig(),
    graph: result.graph ?? { nodes: [], edges: [] },
    files: result.files ?? [],
    access: result.access ?? result.config?.access ?? { ...EMPTY_ACCESS },
  };
}


function MetricCard({ label, value, hint }) {
  return (
    <div className="metric-card">
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      <span className="metric-hint">{hint}</span>
    </div>
  );
}


function LaneHeader({ lane, actions }) {
  const copy = LANE_COPY[lane];
  return (
    <section className={`view-header view-header--${lane}`}>
      <div className="view-header__body">
        <span className="eyebrow">{copy.eyebrow}</span>
        <h2>{copy.title}</h2>
        <p>{copy.description}</p>
      </div>
      <div className="view-header__actions">{actions}</div>
    </section>
  );
}


function CompactLaneHeader({ lane, actions, summary }) {
  const copy = LANE_COPY[lane];
  return (
    <section className={`compact-lane-header compact-lane-header--${lane}`}>
      <div className="compact-lane-header__body">
        <span className="eyebrow">{copy.eyebrow}</span>
        <strong>{copy.title}</strong>
        {summary ? <span className="microcopy">{summary}</span> : null}
      </div>
      <div className="compact-lane-header__actions">{actions}</div>
    </section>
  );
}


function SubtabBar({ tabs, activeTab, onSelect }) {
  return (
    <div className="subtab-bar">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`subtab-chip ${activeTab === tab.id ? "subtab-chip--active" : ""}`}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}


function EmptyTabState({ title, body, actions }) {
  return (
    <section className="empty-state empty-state--roomy">
      <h3>{title}</h3>
      <p>{body}</p>
      {actions?.length ? (
        <div className="empty-state__actions">
          {actions.map((action) => (
            <button
              key={action.label}
              className={action.primary ? "primary-button" : "secondary-button"}
              type="button"
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}


function QuickStartPanel({
  demoExample,
  onLoadDemo,
  onAddSource,
  onRunPreview,
  hasSources,
  activeResult,
}) {
  const steps = [
    {
      label: "1. Start with content",
      description: hasSources
        ? `${hasSources} folder${hasSources > 1 ? "s" : ""} already in the workspace.`
        : "Load the bundled demo or add your first folder or disk.",
      actionLabel: demoExample ? "Load guided demo" : "Add folder",
      action: demoExample ? onLoadDemo : onAddSource,
      primary: true,
    },
    {
      label: "2. Preview the lens",
      description: activeResult?.summary?.file_count
        ? `${activeResult.summary.file_count} files matched the current rules.`
        : "Preview shows what will make it into the vault before you build.",
      actionLabel: "Run preview",
      action: onRunPreview,
    },
    {
      label: "3. Build the vault",
      description: "Build writes an Obsidian-friendly vault plus graph and manifest artifacts.",
    },
  ];

  return (
    <section className="quickstart-panel">
      <div className="panel__header">
        <div>
          <span className="eyebrow">Quick start</span>
          <h3>Make the first successful run obvious</h3>
        </div>
      </div>
      <div className="quickstart-grid">
        {steps.map((step) => (
          <article key={step.label} className="quickstart-card">
            <strong>{step.label}</strong>
            <p>{step.description}</p>
            {step.action ? (
              <button
                className={step.primary ? "primary-button" : "secondary-button"}
                type="button"
                onClick={step.action}
              >
                {step.actionLabel}
              </button>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}


function ResultSpotlight({ result, outputDir, snapshotBundle, onOpenNotes, onOpenGraph }) {
  if (!result) {
    return null;
  }

  return (
    <section className="panel panel--spotlight">
      <div className="panel__header panel__header--spread">
        <div>
          <span className="eyebrow">Current result</span>
          <h3>The workspace is now populated</h3>
        </div>
        <div className="hero__actions hero__actions--tight">
          <button className="secondary-button" type="button" onClick={onOpenNotes}>
            Open notes
          </button>
          <button className="secondary-button" type="button" onClick={onOpenGraph}>
            Open graph
          </button>
        </div>
      </div>
      <div className="metrics-grid">
        <MetricCard label="Sources" value={result.summary?.source_count ?? 0} hint="Folders in this result" />
        <MetricCard label="Files" value={result.summary?.file_count ?? 0} hint="Files that matched" />
        <MetricCard label="Edges" value={result.summary?.edge_count ?? 0} hint="Relationships in the graph" />
        <MetricCard label="Skipped" value={result.summary?.skipped_count ?? 0} hint="Ignored by rules or limits" />
      </div>
      <div className="result-summary">
        <div>
          <span className="eyebrow">Vault output</span>
          <div className="microcopy">{outputDir || result.artifacts?.vault_dir || "Not built yet"}</div>
        </div>
        <div>
          <span className="eyebrow">Generated at</span>
          <div className="microcopy">{result.summary?.generated_at || "—"}</div>
        </div>
      </div>
      <div className="result-summary">
        <div>
          <span className="eyebrow">Model workflow</span>
          <div className="microcopy">Preview checks scope. Build writes and activates the model. Refresh updates the active built model without forcing a full clean rebuild.</div>
        </div>
      </div>
      {snapshotBundle ? (
        <div className="result-summary">
          <div>
            <span className="eyebrow">Snapshot bundle</span>
            <div className="microcopy">{snapshotBundle.label}</div>
            <div className="microcopy">{snapshotBundle.bundle_dir}</div>
          </div>
          <div>
            <span className="eyebrow">Reusable artifacts</span>
            <div className="microcopy">
              {snapshotBundle.file_count ?? 0} files, {snapshotBundle.edge_count ?? 0} edges,{" "}
              {snapshotBundle.feature_cluster_count ?? 0} clusters
            </div>
            <div className="microcopy">SLCS context: {snapshotBundle.slcs_status || "not_configured"}</div>
          </div>
        </div>
      ) : null}
      {result.summary?.timings ? (
        <section className="panel panel--tight">
          <div className="panel__header">
            <div>
              <span className="eyebrow">Stage timings</span>
              <h3>Execution breakdown</h3>
            </div>
          </div>
          <div className="metrics-grid">
            <MetricCard label="Discovery" value={`${result.summary.timings.source_discovery_seconds ?? 0}s`} hint="Source walk and candidate discovery" />
            <MetricCard label="Analysis" value={`${result.summary.timings.file_analysis_seconds ?? 0}s`} hint="Hashing, summaries, file analysis" />
            <MetricCard label="Edge linking" value={`${result.summary.timings.edge_linking_seconds ?? 0}s`} hint="Markdown relationship extraction" />
            <MetricCard label="Output" value={`${result.summary.timings.output_seconds ?? 0}s`} hint="Copy/link and artifact output" />
            <MetricCard label="Total" value={`${result.summary.timings.total_seconds ?? 0}s`} hint="End-to-end runtime" />
          </div>
        </section>
      ) : null}
    </section>
  );
}


function ArtifactStatusPanel({
  logicProfiles,
  explainBundles,
  patchPreviews,
  applyRuns,
  deltaSnapshots,
  parallelProfiles,
  timeline,
  comparison,
  onRunLogicProfile,
  onCreateExplainBundle,
  onCreatePatchPreview,
  onApplyPatchPreview,
  onCreateDeltaSnapshot,
  onRunParallelProfile,
  onCompareSnapshots,
  busy,
}) {
  const latestLogic = logicProfiles[0];
  const latestExplain = explainBundles[0];
  const latestPatch = patchPreviews[0];
  const latestApply = applyRuns[0];
  const latestDelta = deltaSnapshots[0];
  const latestParallel = parallelProfiles[0];
  const timelineItems = timeline.slice(0, 5);

  return (
    <section className="panel">
      <div className="panel__header panel__header--spread">
        <div>
          <span className="eyebrow">V2 studio</span>
          <h3>Build, logic, explain, and history</h3>
        </div>
        <div className="hero__actions hero__actions--tight">
          <button className="secondary-button" type="button" onClick={onRunLogicProfile} disabled={!!busy}>
            Logic profile
          </button>
          <button className="secondary-button" type="button" onClick={onCreateExplainBundle} disabled={!!busy}>
            Explain bundle
          </button>
          <button className="secondary-button" type="button" onClick={onCreatePatchPreview} disabled={!!busy}>
            Patch preview
          </button>
        </div>
      </div>
      <div className="artifact-grid">
        <MetricCard label="Logic profiles" value={logicProfiles.length} hint={latestLogic ? latestLogic.label : "Not generated yet"} />
        <MetricCard label="Explain bundles" value={explainBundles.length} hint={latestExplain ? latestExplain.label : "Not generated yet"} />
        <MetricCard label="Patch previews" value={patchPreviews.length} hint={latestPatch ? latestPatch.label : "Not generated yet"} />
        <MetricCard label="Apply runs" value={applyRuns.length} hint={latestApply ? latestApply.label : "Not generated yet"} />
        <MetricCard label="Delta snapshots" value={deltaSnapshots.length} hint={latestDelta ? latestDelta.label : "Not generated yet"} />
        <MetricCard label="Parallel scans" value={parallelProfiles.length} hint={latestParallel ? latestParallel.label : "Not generated yet"} />
      </div>
      <div className="artifact-actions">
        <button className="ghost-button" type="button" onClick={onApplyPatchPreview} disabled={!!busy || !latestPatch}>
          Apply latest preview
        </button>
        <button className="ghost-button" type="button" onClick={onCreateDeltaSnapshot} disabled={!!busy}>
          Delta snapshot
        </button>
        <button className="ghost-button" type="button" onClick={onRunParallelProfile} disabled={!!busy}>
          Parallel scan
        </button>
        <button className="ghost-button" type="button" onClick={onCompareSnapshots} disabled={!!busy}>
          Compare snapshots
        </button>
      </div>
      {comparison ? (
        <div className="artifact-note">
          <strong>Latest comparison</strong>
          <span>
            {comparison.summary.changed_count} changed, {comparison.summary.added_count} added, {comparison.summary.removed_count} removed
          </span>
        </div>
      ) : null}
      <div className="artifact-timeline">
        <span className="eyebrow">Recent timeline</span>
        {timelineItems.length ? (
          <ul className="compact-list compact-list--tight">
            {timelineItems.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <strong>{item.label}</strong>
                <span>{item.kind}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-copy">No timeline artifacts yet.</p>
        )}
      </div>
    </section>
  );
}


function SourceCard({
  source,
  index,
  onChange,
  onRemove,
  onBrowse,
  inspectResult,
  inspectBusy,
}) {
  const probeState = !inspectResult
    ? ""
    : !inspectResult.exists
      ? "Path not found"
      : inspectResult.accessible
        ? "Path allowed"
        : "Path blocked";

  return (
    <article className="source-card">
      <div className="source-card__header">
        <div>
          <span className="eyebrow">Folder / disk {index + 1}</span>
          <h3>{source.name || "Untitled folder / disk"}</h3>
        </div>
        <button className="ghost-button" type="button" onClick={() => onRemove(index)}>
          Remove
        </button>
      </div>

      <div className="field-grid">
        <label>
          <span>Label</span>
          <input
            value={source.name}
            onChange={(event) => onChange(index, "name", event.target.value)}
            placeholder="Project docs"
          />
        </label>
        <label>
          <span>Category</span>
          <input
            value={source.category}
            onChange={(event) => onChange(index, "category", event.target.value)}
            placeholder="Projects"
          />
        </label>
        <label className="field-grid__wide">
          <span>Folder / disk path</span>
          <div className="path-field">
            <input
              value={source.path}
              onChange={(event) => onChange(index, "path", event.target.value)}
              placeholder="../Documents or ../../projects/my-repo"
            />
            <button
              className="secondary-button"
              type="button"
              onClick={() => onBrowse(index)}
              disabled={inspectBusy}
            >
              Browse
            </button>
          </div>
        </label>
        <label>
          <span>Mode</span>
          <select value={source.mode || "copy"} onChange={(event) => onChange(index, "mode", event.target.value)}>
            <option value="copy">Copy</option>
            <option value="symlink">Symlink</option>
          </select>
        </label>
        <label>
          <span>Max size (bytes)</span>
          <input
            type="number"
            min="1"
            value={source.max_file_size_bytes}
            onChange={(event) => onChange(index, "max_file_size_bytes", event.target.value)}
            placeholder="Optional"
          />
        </label>
        <label>
          <span>Include patterns</span>
          <textarea
            rows="5"
            value={joinLines(source.include)}
            onChange={(event) => onChange(index, "include", splitLines(event.target.value))}
            placeholder={"README.md\ndocs/**/*.md"}
          />
        </label>
        <label>
          <span>Exclude patterns</span>
          <textarea
            rows="5"
            value={joinLines(source.exclude)}
            onChange={(event) => onChange(index, "exclude", splitLines(event.target.value))}
            placeholder={"node_modules/**\ndist/**"}
          />
        </label>
      </div>

      {inspectResult ? (
        <div className="path-probe">
          <div className="path-probe__header">
            <span className={`status-dot ${inspectResult.accessible ? "status-dot--live" : ""}`} />
            <strong>{probeState}</strong>
          </div>
          <div className="microcopy">{inspectResult.resolved_path}</div>
          {!inspectResult.accessible && inspectResult.access_reason ? (
            <div className="microcopy">{inspectResult.access_reason}</div>
          ) : null}
          {inspectResult.blocked_child_count ? (
            <div className="microcopy">{inspectResult.blocked_child_count} child entries hidden by boundary rules.</div>
          ) : null}
          {inspectResult.exists && inspectResult.is_dir && inspectResult.children.length ? (
            <div className="chip-row">
              {inspectResult.children.map((child) => (
                <span key={child.path} className={`path-chip path-chip--${child.kind}`}>
                  {child.name}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}


function SourceSummaryList({ sourceSummaries }) {
  if (!sourceSummaries?.length) {
    return <p className="empty-copy">Preview to see which files and folders actually made it into the workspace.</p>;
  }

  return (
    <div className="summary-list">
      {sourceSummaries.map((source) => (
        <article className="summary-card" key={source.name}>
          <div className="summary-card__header">
            <div>
              <span className="eyebrow">{source.category}</span>
              <h3>{source.name}</h3>
            </div>
            <div className="summary-pill">{source.file_count} files</div>
          </div>
          <div className="microcopy">{source.source_path}</div>
          {source.entry_files?.length ? (
            <ul className="compact-list">
              {source.entry_files.map((entry) => (
                <li key={`${source.name}-${entry.rel_path}`}>
                  <strong>{entry.rel_path}</strong>
                  {entry.summary ? <span>{entry.summary}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-copy">No entry files matched yet.</p>
          )}
        </article>
      ))}
    </div>
  );
}


function BlockedPathList({ blockedPaths, onRemove, emptyCopy = "No excluded folders or files yet." }) {
  if (!blockedPaths.length) {
    return <p className="empty-copy">{emptyCopy}</p>;
  }

  return (
    <div className="blocked-list">
      {blockedPaths.map((pathValue, index) => (
        <div key={`${pathValue}-${index}`} className="blocked-row">
          <code>{pathValue}</code>
          <button className="ghost-button" type="button" onClick={() => onRemove(index)}>
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}


export default function App() {
  const [activeTab, setActiveTab] = useState("vault");
  const [mainTab, setMainTab] = useState("structure");
  const [structureTab, setStructureTab] = useState("setup");
  const [digitalBrainTab, setDigitalBrainTab] = useState("setup");
  const [logicTab, setLogicTab] = useState("overview");
  const [explainTab, setExplainTab] = useState("overview");
  const [buildTab, setBuildTab] = useState("goal");
  const [appInfo, setAppInfo] = useState(null);
  const [examples, setExamples] = useState([]);
  const [presets, setPresets] = useState([]);
  const [buildHistory, setBuildHistory] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [snapshotBundles, setSnapshotBundles] = useState([]);
  const [buildPatchPreviews, setBuildPatchPreviews] = useState([]);
  const [buildApplyRuns, setBuildApplyRuns] = useState([]);
  const [parallelScanProfiles, setParallelScanProfiles] = useState([]);
  const [deltaSnapshots, setDeltaSnapshots] = useState([]);
  const [logicProfiles, setLogicProfiles] = useState([]);
  const [explainBundles, setExplainBundles] = useState([]);
  const [digitalBrainIndexes, setDigitalBrainIndexes] = useState([]);
  const [digitalBrainRecords, setDigitalBrainRecords] = useState([]);
  const [digitalBrainAdapterContracts, setDigitalBrainAdapterContracts] = useState([]);
  const [digitalBrainIndexDetail, setDigitalBrainIndexDetail] = useState(null);
  const [historyTimeline, setHistoryTimeline] = useState([]);
  const [historyComparison, setHistoryComparison] = useState(null);
  const [scopeCompareLeftId, setScopeCompareLeftId] = useState("");
  const [scopeCompareRightId, setScopeCompareRightId] = useState("");
  const [selectedBrainRecordId, setSelectedBrainRecordId] = useState("");
  const [selectedFocusNodeId, setSelectedFocusNodeId] = useState("");
  const [buildGoalDraft, setBuildGoalDraft] = useState("Generate a deterministic scoped improvement plan");
  const [buildPiecesDraft, setBuildPiecesDraft] = useState("docs_cleanup_piece");
  const [activeBuildScope, setActiveBuildScope] = useState(null);
  const [logicWorkerProfile, setLogicWorkerProfile] = useState("default");
  const [canvases, setCanvases] = useState([]);
  const [canvasTemplates, setCanvasTemplates] = useState([]);
  const [selectedCanvasId, setSelectedCanvasId] = useState("");
  const [jobs, setJobs] = useState([]);
  const [activeJobId, setActiveJobId] = useState("");
  const [jobExploreLane, setJobExploreLane] = useState("structure");
  const [layout, setLayout] = useState({
    active_tab: "vault",
    selected_file_path: null,
    expanded_nodes: [],
    graph_local_depth: 0,
    graph_source_filter: "all",
    graph_pinned_nodes: [],
    graph_viewport: { x: 0, y: 0, scale: 1 },
  });
  const [config, setConfig] = useState(createEmptyConfig());
  const [preview, setPreview] = useState(null);
  const [buildResult, setBuildResult] = useState(null);
  const [busy, setBusy] = useState("boot");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [inspectBusyIndex, setInspectBusyIndex] = useState(-1);
  const [inspectResults, setInspectResults] = useState({});
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [filePreviewBusy, setFilePreviewBusy] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState(() => new Set());
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickQuery, setQuickQuery] = useState("");
  const [notesFilter, setNotesFilter] = useState("all");

  const deferredSources = useDeferredValue(config.sources);
  const activeResult = buildResult ?? preview;
  const files = activeResult?.files ?? [];
  const bookmarkPathSet = useMemo(
    () => new Set((bookmarks ?? []).filter((item) => item.type === "file" && item.path).map((item) => item.path)),
    [bookmarks],
  );
  const canvasScopeBookmarks = useMemo(
    () => (bookmarks ?? []).filter((item) => item.type === "canvas"),
    [bookmarks],
  );
  const digitalBrainViewBookmarks = useMemo(
    () => (bookmarks ?? []).filter((item) => item.type === "brain_view"),
    [bookmarks],
  );
  const digitalBrainMemorySeeds = useMemo(
    () => (digitalBrainRecords ?? []).filter((item) => item.kind === "memory"),
    [digitalBrainRecords],
  );
  const digitalBrainDecisionSeeds = useMemo(
    () => (digitalBrainRecords ?? []).filter((item) => item.kind === "decision"),
    [digitalBrainRecords],
  );
  const digitalBrainTopicSeeds = useMemo(
    () => (digitalBrainRecords ?? []).filter((item) => item.kind === "topic"),
    [digitalBrainRecords],
  );
  const digitalBrainTaskSeeds = useMemo(
    () => (digitalBrainRecords ?? []).filter((item) => item.kind === "task"),
    [digitalBrainRecords],
  );
  const digitalBrainWorkingSeeds = useMemo(
    () => (digitalBrainRecords ?? []).filter((item) => item.kind !== "decision"),
    [digitalBrainRecords],
  );
  const selectedBrainRecord =
    digitalBrainRecords.find((item) => item.id === selectedBrainRecordId) || null;
  const visibleFiles = useMemo(() => {
    const noiseNames = new Set([".DS_Store", "Thumbs.db"]);
    const filtered = files.filter((file) => !noiseNames.has(file.label));
    if (notesFilter === "all") {
      return filtered;
    }
    if (notesFilter === "docs") {
      return filtered.filter((file) => [".md", ".pdf", ".txt"].includes((file.extension || "").toLowerCase()));
    }
    if (notesFilter === "markdown") {
      return filtered.filter((file) => (file.extension || "").toLowerCase() === ".md");
    }
    if (notesFilter === "code") {
      return filtered.filter((file) => [".py", ".js", ".ts", ".tsx", ".jsx", ".rs", ".go", ".java", ".sql"].includes((file.extension || "").toLowerCase()));
    }
    if (notesFilter === "binary") {
      return filtered.filter((file) => !file.extension || ![".md", ".pdf", ".txt", ".py", ".js", ".ts", ".tsx", ".jsx", ".rs", ".go", ".java", ".sql", ".json", ".toml", ".yaml", ".yml", ".csv"].includes((file.extension || "").toLowerCase()));
    }
    if (notesFilter === "recent") {
      return [...filtered].sort((left, right) => (right.modified_at || right.original_path || "").localeCompare(left.modified_at || left.original_path || "")).slice(0, 200);
    }
    if (notesFilter === "bookmarked") {
      return filtered.filter((file) => bookmarkPathSet.has(file.original_path));
    }
    return filtered;
  }, [bookmarkPathSet, files, notesFilter]);
  const bookmarkFiles = useMemo(
    () =>
      (bookmarks ?? [])
        .filter((item) => item.type === "file")
        .map((item) => files.find((file) => file.original_path === item.path || file.id === item.file_id))
        .filter(Boolean),
    [bookmarks, files],
  );
  const tree = useMemo(() => buildFileTree(visibleFiles), [visibleFiles]);
  const searchResults = useMemo(() => searchFiles(visibleFiles, quickQuery, 24), [quickQuery, visibleFiles]);
  const adjacency = useMemo(() => buildAdjacency(activeResult?.graph ?? { nodes: [], edges: [] }), [activeResult]);
  const fileLookup = useMemo(() => new Map(visibleFiles.map((file) => [file.id, file])), [visibleFiles]);
  const guidedDemo = examples.find((example) => example.id === "guided-demo") || examples[0] || null;
  const latestJob = jobs[0] || null;
  const activeJob = activeJobId ? jobs.find((job) => job.id === activeJobId) || null : null;
  const hasSources = deferredSources.length > 0;
  const hasFiles = files.length > 0;
  const recentFiles = files.slice(0, 6);
  const latestDigitalBrainIndex = digitalBrainIndexes[0] || activeResult?.digital_brain_index || null;
  const digitalBrainContents = digitalBrainIndexDetail?.contents || {};
  const digitalBrainFocusGraph = digitalBrainContents.focus_graph || null;
  const digitalBrainMemoryShells = digitalBrainContents.memory_shells || [];
  const digitalBrainSourcePriority = digitalBrainContents.source_priority || [];
  const digitalBrainViewRecommendations = digitalBrainContents.cognitive_view_recommendations || [];
  const isExploreLane = mainTab === "structure" || mainTab === "digital-brain";
  const activeExploreLane = mainTab === "digital-brain" ? "digital-brain" : "structure";
  const activeExploreTab = mainTab === "digital-brain" ? digitalBrainTab : structureTab;
  const activeExploreView = exploreViewForLaneTab(activeExploreLane, activeExploreTab);
  const preferredExploreLane = isExploreLane ? activeExploreLane : "structure";
  const blockedRuleCount =
    (config.access?.blocked_paths?.length ?? 0) + (config.access?.blocked_patterns?.length ?? 0);
  const globalBlockedRuleCount =
    (config.global_exclusions?.blocked_paths?.length ?? 0) + (config.global_exclusions?.blocked_patterns?.length ?? 0);
  const globalBlockedPatternSet = useMemo(
    () => new Set(config.global_exclusions?.blocked_patterns ?? []),
    [config.global_exclusions?.blocked_patterns],
  );
  const decisionCandidates = useMemo(() => {
    const keywordRe = /\b(decision|decide|plan|summary|proposal|roadmap|next steps|conclusion)\b/i;
    return files
      .filter((file) => keywordRe.test(`${file.label || ""} ${file.summary || ""} ${file.rel_path || ""}`))
      .slice(0, 12);
  }, [files]);
  const digitalBrainMemoryCandidates = useMemo(() => {
    return digitalBrainMemoryShells
      .map((item) => fileLookup.get(item.file_id))
      .filter(Boolean)
      .slice(0, 12);
  }, [digitalBrainMemoryShells, fileLookup]);
  const selectedFocusNode = useMemo(
    () => (digitalBrainFocusGraph?.nodes || []).find((node) => node.id === selectedFocusNodeId) || null,
    [digitalBrainFocusGraph?.nodes, selectedFocusNodeId],
  );

  async function refreshV2Artifacts() {
    const [bootstrapPayload, timeline] = await Promise.all([fetchBootstrap(), fetchHistoryTimeline()]);
    startTransition(() => {
      setSnapshotBundles(bootstrapPayload.snapshot_bundles ?? []);
      setBuildPatchPreviews(bootstrapPayload.build_patch_previews ?? []);
      setBuildApplyRuns(bootstrapPayload.build_apply_runs ?? []);
      setParallelScanProfiles(bootstrapPayload.parallel_scan_profiles ?? []);
      setDeltaSnapshots(bootstrapPayload.delta_snapshots ?? []);
      setLogicProfiles(bootstrapPayload.logic_profiles ?? []);
      setExplainBundles(bootstrapPayload.explain_bundles ?? []);
      setDigitalBrainIndexes(bootstrapPayload.digital_brain_indexes ?? []);
      setDigitalBrainRecords(bootstrapPayload.digital_brain_records ?? []);
      setDigitalBrainAdapterContracts(bootstrapPayload.digital_brain_adapter_contracts ?? []);
      setCanvasTemplates(bootstrapPayload.canvas_templates ?? []);
      setHistoryTimeline(timeline ?? []);
    });
    return bootstrapPayload;
  }

  function syncActiveSurface(view) {
    if (view === "notes") {
      setActiveTab("notes");
    } else if (view === "canvas") {
      setActiveTab("canvas");
    } else if (view === "graph") {
      setActiveTab("graph");
    } else {
      setActiveTab("vault");
    }
  }

  function openExploreTab(lane, tab) {
    setMainTab(lane);
    if (lane === "digital-brain") {
      setDigitalBrainTab(tab);
    } else {
      setStructureTab(tab);
    }
    syncActiveSurface(exploreViewForLaneTab(lane, tab));
  }

  function openStructureTab(tab) {
    openExploreTab("structure", tab);
  }

  const outgoingLinks = useMemo(() => {
    if (!selectedFile) {
      return [];
    }
    return (adjacency.outgoing.get(selectedFile.id) || [])
      .map((id) => fileLookup.get(id))
      .filter(Boolean);
  }, [adjacency.outgoing, fileLookup, selectedFile]);

  const backlinks = useMemo(() => {
    if (!selectedFile) {
      return [];
    }
    return (adjacency.incoming.get(selectedFile.id) || [])
      .map((id) => fileLookup.get(id))
      .filter(Boolean);
  }, [adjacency.incoming, fileLookup, selectedFile]);

  useEffect(() => {
    async function load() {
      try {
        const payload = await fetchBootstrap();
        startTransition(() => {
          setAppInfo(payload.app);
          setExamples(payload.examples ?? []);
          setPresets(payload.presets ?? []);
          setBuildHistory(payload.build_history ?? []);
          setBookmarks(payload.bookmarks ?? []);
          setSnapshots(payload.snapshots ?? []);
          setSnapshotBundles(payload.snapshot_bundles ?? []);
          setBuildPatchPreviews(payload.build_patch_previews ?? []);
          setBuildApplyRuns(payload.build_apply_runs ?? []);
          setParallelScanProfiles(payload.parallel_scan_profiles ?? []);
          setDeltaSnapshots(payload.delta_snapshots ?? []);
          setLogicProfiles(payload.logic_profiles ?? []);
          setExplainBundles(payload.explain_bundles ?? []);
          setDigitalBrainIndexes(payload.digital_brain_indexes ?? []);
          setDigitalBrainRecords(payload.digital_brain_records ?? []);
          setDigitalBrainAdapterContracts(payload.digital_brain_adapter_contracts ?? []);
          setCanvases(payload.canvases ?? []);
          setCanvasTemplates(payload.canvas_templates ?? []);
          setSelectedCanvasId((payload.canvases ?? [])[0]?.id || "");
          setJobs(payload.jobs ?? []);
          setConfig(normalizeConfig(payload.config));
          setLayout(payload.layout ?? layout);
          setBuildResult(normalizeResult(payload.last_result));
          setPreview(normalizeResult(payload.last_result));
          setMainTab("structure");
          setStructureTab("setup");
          setDigitalBrainTab("setup");
          setLogicTab("overview");
          setExplainTab("overview");
          setBuildTab("goal");
          setActiveTab("vault");
          if (!(payload.last_result?.summary?.file_count > 0)) {
            setNotice(
              (payload.config?.sources ?? []).length
                ? "Preview the current demo workspace to populate Notes, Canvas, and Graph."
                : "Load the guided demo or add a folder or disk to get a first working result.",
            );
          }
        });
        fetchHistoryTimeline().then((timeline) => setHistoryTimeline(timeline ?? [])).catch(() => {});
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setBusy("");
      }
    }

    load();
  }, []);

  useEffect(() => {
    if (!visibleFiles.length) {
      setSelectedFile(null);
      setFilePreview(null);
      return;
    }
    setExpandedNodes((current) => {
      const next = new Set(current);
      for (const root of tree) {
        next.add(root.id);
      }
      return next;
    });
    if (selectedFile && fileLookup.has(selectedFile.id)) {
      return;
    }
    const preferred = visibleFiles.find((file) => file.original_path === layout.selected_file_path);
    const bestCandidate =
      preferred ||
      visibleFiles.find((file) => (file.extension || "").toLowerCase() === ".md") ||
      visibleFiles.find((file) => [".txt", ".pdf", ".json", ".toml", ".yml", ".yaml"].includes((file.extension || "").toLowerCase())) ||
      visibleFiles[0];
    setSelectedFile(bestCandidate);
  }, [fileLookup, layout.selected_file_path, selectedFile, tree, visibleFiles]);

  useEffect(() => {
    async function loadPreview() {
      if (!selectedFile) {
        setFilePreview(null);
        return;
      }
      setFilePreviewBusy(true);
      try {
        const payload = await fetchFilePreview(selectedFile.original_path, config.access);
        setFilePreview(payload);
      } catch (previewError) {
        setError(previewError.message);
      } finally {
        setFilePreviewBusy(false);
      }
    }

    loadPreview();
  }, [config.access, selectedFile]);

  useEffect(() => {
    async function loadDigitalBrainDetail() {
      if (!latestDigitalBrainIndex?.id) {
        setDigitalBrainIndexDetail(null);
        return;
      }
      try {
        const payload = await fetchDigitalBrainIndex(latestDigitalBrainIndex.id);
        setDigitalBrainIndexDetail(payload);
      } catch {
        setDigitalBrainIndexDetail(null);
      }
    }

    loadDigitalBrainDetail();
  }, [latestDigitalBrainIndex?.id]);

  useEffect(() => {
    const nodes = digitalBrainFocusGraph?.nodes || [];
    if (!nodes.length) {
      setSelectedFocusNodeId("");
      return;
    }
    if (selectedFocusNodeId && nodes.some((node) => node.id === selectedFocusNodeId)) {
      return;
    }
    setSelectedFocusNodeId(nodes[0].id);
  }, [digitalBrainFocusGraph?.nodes, selectedFocusNodeId]);

  useEffect(() => {
    if (!activeJobId) {
      return undefined;
    }

    const interval = window.setInterval(async () => {
      try {
        const job = await fetchJob(activeJobId);
        setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)].slice(0, 12));
        if (job.status === "completed") {
          const result = normalizeResult(job.result);
          if (job.kind === "preview") {
            setPreview(result);
            if (result.snapshot_bundle) {
              setSnapshotBundles((current) => [
                result.snapshot_bundle,
                ...current.filter((item) => item.id !== result.snapshot_bundle.id),
              ].slice(0, 20));
            }
            if (result.digital_brain_index) {
              setDigitalBrainIndexes((current) => [
                result.digital_brain_index,
                ...current.filter((item) => item.id !== result.digital_brain_index.id),
              ].slice(0, 20));
            }
            setNotice(
              result.summary?.file_count
                ? `Preview ready. ${result.summary.file_count} files are now visible in the workspace.`
                : "Preview finished, but nothing matched yet. Adjust sources or patterns.",
            );
            openExploreTab(jobExploreLane, result.summary?.file_count ? exploreTabIdForView(jobExploreLane, "graph") : "setup");
          } else {
            setBuildResult(result);
            setPreview(result);
            if (result.snapshot_bundle) {
              setSnapshotBundles((current) => [
                result.snapshot_bundle,
                ...current.filter((item) => item.id !== result.snapshot_bundle.id),
              ].slice(0, 20));
            }
            if (result.digital_brain_index) {
              setDigitalBrainIndexes((current) => [
                result.digital_brain_index,
                ...current.filter((item) => item.id !== result.digital_brain_index.id),
              ].slice(0, 20));
            }
            setBuildHistory(await fetchBuildHistory());
            setNotice(
              job.kind === "refresh"
                ? `Model refreshed with ${result.summary?.file_count ?? 0} files and updated graph state.`
                : `Vault built with ${result.summary?.file_count ?? 0} files at ${
                    result.artifacts?.vault_dir || result.artifacts?.output_dir
                  }.`,
            );
            openExploreTab(jobExploreLane, result.summary?.file_count ? exploreTabIdForView(jobExploreLane, "notes") : "setup");
          }
          setBusy("");
          setActiveJobId("");
        } else if (job.status === "failed") {
          setError(job.error || "Job failed");
          setBusy("");
          setActiveJobId("");
          openExploreTab(jobExploreLane, "setup");
        }
      } catch (pollError) {
        setError(pollError.message);
        setBusy("");
        setActiveJobId("");
      }
    }, 900);

    return () => window.clearInterval(interval);
  }, [activeJobId, jobExploreLane]);

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setQuickOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      saveLayout({
        ...layout,
        active_tab: activeTab,
        selected_file_path: selectedFile?.original_path || null,
        expanded_nodes: [...expandedNodes],
      }).catch(() => {});
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [activeTab, expandedNodes, layout, selectedFile]);

  function patchConfig(nextConfig) {
    setConfig(normalizeConfig(nextConfig));
    setInspectResults({});
    setPreview(null);
    setBuildResult(null);
    setHistoryComparison(null);
    setActiveBuildScope(null);
    setNotice("");
    setError("");
  }

  function updateField(field, value) {
    patchConfig({ ...config, [field]: value });
  }

  function updateAccessField(field, value) {
    patchConfig({
      ...config,
      access: {
        ...config.access,
        [field]: value,
      },
    });
  }

  function updateDigitalBrainField(field, value) {
    patchConfig({
      ...config,
      digital_brain: {
        ...config.digital_brain,
        [field]: value,
      },
    });
  }

  function updateModelWorkflowField(field, value) {
    patchConfig({
      ...config,
      model_workflow: {
        ...config.model_workflow,
        [field]: value,
      },
    });
  }

  function toggleDigitalBrainCategory(categoryId) {
    const current = new Set(config.digital_brain.priority_categories ?? []);
    if (current.has(categoryId)) {
      current.delete(categoryId);
    } else {
      current.add(categoryId);
    }
    updateDigitalBrainField("priority_categories", [...current]);
  }

  function updateSource(index, field, value) {
    const nextSources = config.sources.map((source, sourceIndex) =>
      sourceIndex === index ? { ...source, [field]: value } : source,
    );
    patchConfig({ ...config, sources: nextSources });
  }

  function upsertSourceFromPath(index, pathValue) {
    const pathParts = pathValue.split("/").filter(Boolean);
    const fallbackName = pathParts[pathParts.length - 1] || "Selected folder";
    const nextSources = config.sources.map((source, sourceIndex) =>
      sourceIndex === index
        ? {
            ...source,
            path: pathValue,
            name: source.name?.trim() ? source.name : fallbackName,
          }
        : source,
    );
    patchConfig({ ...config, sources: nextSources });
  }

  function removeSource(index) {
    patchConfig({ ...config, sources: config.sources.filter((_, sourceIndex) => sourceIndex !== index) });
  }

  function addBlockedPath(pathValue) {
    const nextBlocked = [...(config.access.blocked_paths ?? [])];
    if (!nextBlocked.includes(pathValue)) {
      nextBlocked.push(pathValue);
    }
    updateAccessField("blocked_paths", nextBlocked);
  }

  function removeBlockedPath(index) {
    updateAccessField(
      "blocked_paths",
      (config.access.blocked_paths ?? []).filter((_, blockedIndex) => blockedIndex !== index),
    );
  }

  function updateGlobalExclusionsField(field, value) {
    patchConfig({
      ...config,
      global_exclusions: {
        ...config.global_exclusions,
        [field]: value,
      },
    });
  }

  function toggleGlobalBlockedPattern(pattern) {
    const current = [...(config.global_exclusions?.blocked_patterns ?? [])];
    if (current.includes(pattern)) {
      updateGlobalExclusionsField(
        "blocked_patterns",
        current.filter((value) => value !== pattern),
      );
      return;
    }
    updateGlobalExclusionsField("blocked_patterns", [...current, pattern]);
  }

  function restoreDefaultGlobalBlockedPatterns() {
    updateGlobalExclusionsField("blocked_patterns", [...DEFAULT_GLOBAL_BLOCK_PATTERNS]);
  }

  function addGlobalBlockedPath(pathValue) {
    const nextBlocked = [...(config.global_exclusions?.blocked_paths ?? [])];
    if (!nextBlocked.includes(pathValue)) {
      nextBlocked.push(pathValue);
    }
    updateGlobalExclusionsField("blocked_paths", nextBlocked);
  }

  function removeGlobalBlockedPath(index) {
    updateGlobalExclusionsField(
      "blocked_paths",
      (config.global_exclusions?.blocked_paths ?? []).filter((_, blockedIndex) => blockedIndex !== index),
    );
  }

  function toggleNode(nodeId) {
    setExpandedNodes((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }

  function validateWorkspaceRun(nextConfig) {
    if (!nextConfig.sources.length) {
      return "Load the guided demo or add at least one folder or disk before running preview or build.";
    }

    const incompleteSource = nextConfig.sources.find((source) => !source.path?.trim() || !source.name?.trim());
    if (incompleteSource) {
      return "Each folder or disk entry needs both a label and a path before preview or build can run.";
    }

    return "";
  }

  async function handleBrowseOutputDirectory() {
    setError("");
    try {
      const payload = await chooseNativePath("directory");
      if (!payload.path) {
        return;
      }
      updateField("output_dir", payload.path);
    } catch (browseError) {
      setError(browseError.message);
    }
  }

  async function handleBrowseFolder(index) {
    setInspectBusyIndex(index);
    setError("");
    try {
      const payload = await chooseNativePath("directory");
      if (!payload.path) {
        return;
      }
      upsertSourceFromPath(index, payload.path);
      const inspectPayload = await inspectPath(payload.path, config.access);
      setInspectResults((current) => ({ ...current, [index]: inspectPayload }));
    } catch (browseError) {
      setError(browseError.message);
    } finally {
      setInspectBusyIndex(-1);
    }
  }

  async function handleAddFolderByBrowse() {
    setError("");
    try {
      const payload = await chooseNativePath("directory");
      if (!payload.path) {
        return;
      }
      const pathParts = payload.path.split("/").filter(Boolean);
      const fallbackName = pathParts[pathParts.length - 1] || "Selected folder";
      patchConfig({
        ...config,
        sources: [
          ...config.sources,
          {
            ...EMPTY_SOURCE,
            name: fallbackName,
            path: payload.path,
          },
        ],
      });
    } catch (browseError) {
      setError(browseError.message);
    }
  }

  async function handleAddBlockedByBrowse(kind = "directory") {
    setError("");
    try {
      const payload = await chooseNativePath(kind);
      if (!payload.path) {
        return;
      }
      addBlockedPath(payload.path);
    } catch (browseError) {
      setError(browseError.message);
    }
  }

  async function handleAddGlobalBlockedByBrowse(kind = "directory") {
    setError("");
    try {
      const payload = await chooseNativePath(kind);
      if (!payload.path) {
        return;
      }
      addGlobalBlockedPath(payload.path);
    } catch (browseError) {
      setError(browseError.message);
    }
  }

  async function handleSave() {
    setBusy("save");
    setError("");
    setNotice("");
    try {
      const payload = await saveWorkspaceConfig(serializeConfig(config));
      startTransition(() => setConfig(normalizeConfig(payload)));
      setNotice("Workspace settings saved.");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy("");
    }
  }

  async function startWorkspaceJob(kind, configOverride = config) {
    const payload = serializeConfig(configOverride);
    const validationError = validateWorkspaceRun(payload);
    if (validationError) {
      setError(validationError);
      openExploreTab(preferredExploreLane, "setup");
      return;
    }

    setBusy(kind);
    setError("");
    setNotice("");
    try {
      setJobExploreLane(preferredExploreLane);
      const job = await createJob(kind, payload, kind === "refresh" ? false : true, workerProfileForLane(preferredExploreLane));
      setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)].slice(0, 12));
      setActiveJobId(job.id);
    } catch (jobError) {
      setError(jobError.message);
      setBusy("");
    }
  }

  async function handleLoadExample(example, autoPreview = false) {
    const nextConfig = normalizeConfig(example.config);
    patchConfig(nextConfig);
    openExploreTab(preferredExploreLane, "setup");
    if (autoPreview && nextConfig.sources.length) {
      await startWorkspaceJob("preview", nextConfig);
    } else {
      setNotice(`${example.label} loaded.`);
    }
  }

  function loadPreset(preset) {
    patchConfig(normalizeConfig(preset.config));
    setNotice(`${preset.name} loaded.`);
    openExploreTab(preferredExploreLane, "setup");
  }

  async function handleSavePreset() {
    const name = window.prompt("Preset name", config.vault_name || "Context Vault");
    if (!name) {
      return;
    }
    const description = window.prompt("Short description", "Saved from the current layout") || "";
    try {
      const preset = await createPreset({
        name,
        description,
        config: serializeConfig(config),
      });
      setPresets((current) => [preset, ...current.filter((item) => item.id !== preset.id)]);
      setNotice(`Preset "${preset.name}" saved.`);
    } catch (presetError) {
      setError(presetError.message);
    }
  }

  async function handleDeletePreset(presetId) {
    try {
      await deletePreset(presetId);
      setPresets((current) => current.filter((preset) => preset.id !== presetId));
    } catch (presetError) {
      setError(presetError.message);
    }
  }

  function exportConfig() {
    const blob = new Blob([JSON.stringify(serializeConfig(config), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "context-vault-config.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleExportBundle() {
    try {
      const payload = await exportBundle();
      setNotice(`Bundle exported to ${payload.path}`);
    } catch (bundleError) {
      setError(bundleError.message);
    }
  }

  async function handleRunLogicProfile(scope = null) {
    const scopedSelection = uniqueValues(scope?.selected_files ?? []);
    const scopedConfig = scopedSelection.length
      ? buildScopedConfigFromFiles(config, activeResult?.files ?? files, scopedSelection)
      : serializeConfig(config);
    const validationError = validateWorkspaceRun(scopedConfig);
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy("logic-profile");
    setError("");
    setNotice("");
    try {
      const payload = await createLogicProfile(scopedConfig, logicWorkerCount, scopedSelection);
      await refreshV2Artifacts();
      setNotice(
        scopedSelection.length
          ? `Logic profile ready for ${payload.profile.summary.file_count} files in ${scope.label}.`
          : `Logic profile ready for ${payload.profile.summary.file_count} files.`,
      );
    } catch (logicError) {
      setError(logicError.message);
    } finally {
      setBusy("");
    }
  }

  async function handleCreateExplainBundle(scope = null) {
    const snapshotBundle = snapshotBundles[0] || activeResult?.snapshot_bundle;
    if (!snapshotBundle?.id) {
      setError("Run preview or build first so there is a snapshot bundle to explain.");
      return;
    }
    const scopedSelection = uniqueValues(scope?.selected_files ?? []);
    setBusy("explain-bundle");
    setError("");
    setNotice("");
    try {
      const payload = await createExplainBundle(snapshotBundle.id, logicProfiles[0]?.id || null, scopedSelection);
      await refreshV2Artifacts();
      setNotice(
        scopedSelection.length
          ? `Explain bundle created for ${scope.label} with ${payload.bundle.summary.top_file_count} top files.`
          : `Explain bundle created with ${payload.bundle.summary.top_file_count} top files.`,
      );
    } catch (explainError) {
      setError(explainError.message);
    } finally {
      setBusy("");
    }
  }

  async function handleCreatePatchPreview(scope = null) {
    const snapshotBundle = snapshotBundles[0] || activeResult?.snapshot_bundle;
    if (!snapshotBundle?.id) {
      setError("Run preview or build first so there is a snapshot bundle to use.");
      return;
    }
    const resolvedScope = scope ? resolveCanvasScope(scope) : activeBuildScope;
    const goal = resolvedScope?.build_goal?.trim() || buildGoalDraft.trim() || window.prompt("Build goal", "Generate a deterministic scoped improvement plan");
    if (!goal) {
      return;
    }
    const piecesValue = buildPiecesDraft.trim() || window.prompt("SLCS pieces (comma separated)", "docs_cleanup_piece");
    const selectedPieces = (piecesValue || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const selectedFiles = resolvedScope?.selected_files?.length
      ? resolvedScope.selected_files
      : selectedFile?.rel_path
        ? [selectedFile.rel_path]
        : (activeResult?.files ?? []).slice(0, 3).map((file) => file.rel_path);
    const allowedTargets = resolvedScope?.allowed_targets?.length
      ? resolvedScope.allowed_targets
      : config.sources.map((source) => source.path).filter(Boolean);
    const forbiddenPaths = resolvedScope?.forbidden_paths?.length
      ? resolvedScope.forbidden_paths
      : config.access.blocked_paths ?? [];

    setBusy("patch-preview");
    setError("");
    setNotice("");
    try {
      const payload = await createPatchPreview({
        goal,
        snapshot_bundle_id: snapshotBundle.id,
        explain_bundle_id: resolvedScope?.selected_files?.length ? null : explainBundles[0]?.id || null,
        adapter_id: "deterministic",
        selected_slcs_pieces: selectedPieces,
        selected_files: selectedFiles,
        allowed_targets: allowedTargets,
        forbidden_paths: forbiddenPaths,
        metadata: resolvedScope?.selected_files?.length
          ? {
              canvas_id: resolvedScope.canvas_id || "",
              canvas_label: canvases.find((item) => item.id === resolvedScope.canvas_id)?.name || "",
              scope_label: resolvedScope.label,
              workflow: resolvedScope.workflow,
              selected_card_labels: resolvedScope.selected_card_labels,
              review_notes: resolvedScope.review_notes,
            }
          : {},
      });
      await refreshV2Artifacts();
      setNotice(
        resolvedScope?.selected_files?.length
          ? `Patch preview created for ${resolvedScope.label} with ${payload.copied_file_count} scoped input files.`
          : `Patch preview created with ${payload.copied_file_count} scoped input files.`,
      );
      if (resolvedScope?.selected_files?.length) {
        setActiveBuildScope(resolvedScope);
      }
      setMainTab("build");
      setBuildTab("preview");
    } catch (patchError) {
      setError(patchError.message);
    } finally {
      setBusy("");
    }
  }

  function handleUseCanvasScopeInBuild(scope) {
    const resolvedScope = resolveCanvasScope(scope);
    if (!resolvedScope.selected_files.length) {
      setError("This board scope does not include any file cards yet.");
      return;
    }
    setActiveBuildScope(resolvedScope);
    if (resolvedScope.build_goal) {
      setBuildGoalDraft(resolvedScope.build_goal);
    }
    setMainTab("build");
    setBuildTab("goal");
    setNotice(`Build is now scoped to ${resolvedScope.label} (${resolvedScope.selected_files.length} files).`);
  }

  async function handleApplyPatchPreview() {
    const previewRecord = buildPatchPreviews[0];
    if (!previewRecord?.id) {
      setError("Create a patch preview first.");
      return;
    }
    setBusy("apply-preview");
    setError("");
    setNotice("");
    try {
      const payload = await applyPatchPreview(previewRecord.id);
      await refreshV2Artifacts();
      setNotice(`Scratch apply run created with ${payload.apply_summary.changed_file_count} changed files.`);
    } catch (applyError) {
      setError(applyError.message);
    } finally {
      setBusy("");
    }
  }

  async function handleCreateDeltaSnapshot() {
    const snapshotBundle = snapshotBundles[0] || activeResult?.snapshot_bundle;
    if (!snapshotBundle?.id) {
      setError("Run preview or build first so there is a previous snapshot to compare against.");
      return;
    }
    const validationError = validateWorkspaceRun(serializeConfig(config));
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy("delta-snapshot");
    setError("");
    setNotice("");
    try {
      const payload = await createDeltaSnapshot(serializeConfig(config), snapshotBundle.id);
      await refreshV2Artifacts();
      setNotice(
        `Delta snapshot created: ${payload.delta.changed_files.length} changed, ${payload.delta.added_files.length} added, ${payload.delta.removed_files.length} removed.`,
      );
    } catch (deltaError) {
      setError(deltaError.message);
    } finally {
      setBusy("");
    }
  }

  async function handleRunParallelProfile() {
    const validationError = validateWorkspaceRun(serializeConfig(config));
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy("parallel-profile");
    setError("");
    setNotice("");
    try {
      const payload = await createParallelScanProfile(serializeConfig(config), logicWorkerCount);
      await refreshV2Artifacts();
      setNotice(`Parallel scan profile captured for ${payload.profile.summary.file_count} files.`);
    } catch (parallelError) {
      setError(parallelError.message);
    } finally {
      setBusy("");
    }
  }

  async function handleCompareSnapshots() {
    const [left, right] = snapshotBundles;
    if (!left?.id || !right?.id) {
      setError("At least two snapshot bundles are needed to compare history.");
      return;
    }
    setBusy("compare-snapshots");
    setError("");
    setNotice("");
    try {
      const payload = await compareHistorySnapshots(left.id, right.id);
      setHistoryComparison(payload);
      setNotice(
        `Compared snapshots: ${payload.summary.changed_count} changed, ${payload.summary.added_count} added, ${payload.summary.removed_count} removed.`,
      );
    } catch (compareError) {
      setError(compareError.message);
    } finally {
      setBusy("");
    }
  }

  async function handleBookmarkFile(file) {
    if (!file) {
      return;
    }
    try {
      const bookmark = await createBookmark({
        type: "file",
        label: file.label,
        path: file.original_path,
        file_id: file.id,
      });
      setBookmarks((current) => [bookmark, ...current.filter((item) => item.id !== bookmark.id)]);
      setNotice(`Bookmarked ${file.label}.`);
    } catch (bookmarkError) {
      setError(bookmarkError.message);
    }
  }

  async function handleSaveFile(file, content) {
    if (!file) {
      return;
    }
    try {
      await saveFile(file.original_path, content, config.access);
      const payload = await fetchFilePreview(file.original_path, config.access);
      setFilePreview(payload);
      setNotice(`Saved ${file.label}.`);
      setSnapshots(await fetchBootstrap().then((data) => data.snapshots ?? snapshots));
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  async function handleCreateNote() {
    const firstAllowedRoot = config.access.allowed_roots[0];
    if (!firstAllowedRoot) {
      setError("Add an allowed root first so the app knows where a new note is permitted to be created.");
      openExploreTab(preferredExploreLane, "setup");
      return;
    }

    const directory = window.prompt("Create note in directory", firstAllowedRoot);
    if (!directory) {
      return;
    }
    const name = window.prompt("New note filename", "Untitled.md");
    if (!name) {
      return;
    }
    try {
      const payload = await createFile(directory, name, `# ${name.replace(/\.md$/i, "")}\n\n`, config.access);
      setNotice(`Created ${payload.path}`);
      await startWorkspaceJob("preview");
    } catch (createError) {
      setError(createError.message);
    }
  }

  async function handleRestoreSnapshot(snapshotId) {
    try {
      await restoreSnapshot(snapshotId);
      const payload = await fetchBootstrap();
      setSnapshots(payload.snapshots ?? []);
      setConfig(normalizeConfig(payload.config));
      setNotice("Snapshot restored.");
    } catch (snapshotError) {
      setError(snapshotError.message);
    }
  }

  async function handleCreateCanvas() {
    const name = window.prompt("Canvas name", "Workspace board");
    if (!name) {
      return;
    }
    try {
      const canvas = await createCanvas({
        name,
        description: "Canvas board",
        cards: [],
        edges: [],
        viewport: { x: 40, y: 40, zoom: 0.82 },
        metadata: {},
      });
      setCanvases((current) => [...current, canvas]);
      setSelectedCanvasId(canvas.id);
      openExploreTab(preferredExploreLane, exploreTabIdForView(preferredExploreLane, "canvas"));
    } catch (canvasError) {
      setError(canvasError.message);
    }
  }

  async function handleCreateCanvasFromTemplate(templateId) {
    try {
      const template = buildCanvasTemplate(templateId);
      const canvas = await createCanvas(template);
      setCanvases((current) => [...current, canvas]);
      setSelectedCanvasId(canvas.id);
      openExploreTab(preferredExploreLane, exploreTabIdForView(preferredExploreLane, "canvas"));
      setNotice(`Created ${canvas.name}.`);
    } catch (canvasError) {
      setError(canvasError.message);
    }
  }

  async function handleCreateCanvasFromSavedTemplate(template) {
    if (!template) {
      return;
    }
    try {
      const canvas = await createCanvas({
        name: `${template.name} board`,
        description: template.description || "",
        cards: template.cards || [],
        edges: template.edges || [],
        viewport: template.viewport || { x: 40, y: 40, zoom: 0.82 },
        metadata: template.metadata || {},
      });
      setCanvases((current) => [...current, canvas]);
      setSelectedCanvasId(canvas.id);
      openExploreTab(preferredExploreLane, exploreTabIdForView(preferredExploreLane, "canvas"));
      setNotice(`Created ${canvas.name} from template ${template.name}.`);
    } catch (canvasError) {
      setError(canvasError.message);
    }
  }

  async function handleImportCanvasBoard() {
    try {
      const payload = await chooseNativePath("file");
      if (!payload.path) {
        return;
      }
      const imported = await importCanvasBoard(payload.path);
      setCanvases((current) => [...current, imported.canvas]);
      setSelectedCanvasId(imported.canvas.id);
      openExploreTab(preferredExploreLane, exploreTabIdForView(preferredExploreLane, "canvas"));
      setNotice(
        `Imported canvas ${imported.canvas.name}. Added ${imported.imported_scope_count || 0} scope bookmark`
        + `${imported.imported_scope_count === 1 ? "" : "s"} and ${imported.imported_record_count || 0} Digital Brain record`
        + `${imported.imported_record_count === 1 ? "" : "s"}`
        + `${imported.warnings?.length ? ` Warnings: ${imported.warnings.join(" ")}` : "."}`,
      );
    } catch (canvasError) {
      setError(canvasError.message);
    }
  }

  async function handleSaveCanvasAsTemplate(canvas) {
    if (!canvas) {
      return;
    }
    const name = window.prompt("Template name", `${canvas.name} template`);
    if (!name) {
      return;
    }
    try {
      const template = await createCanvasTemplate({
        name,
        description: canvas.description || "",
        cards: canvas.cards || [],
        edges: canvas.edges || [],
        viewport: canvas.viewport || { x: 40, y: 40, zoom: 0.82 },
        metadata: canvas.metadata || {},
      });
      setCanvasTemplates((current) => [template, ...current.filter((item) => item.id !== template.id)]);
      setNotice(`Saved template ${template.name}.`);
    } catch (templateError) {
      setError(templateError.message);
    }
  }

  async function handleUpdateCanvasTemplateFromCanvas(template, canvas) {
    if (!template || !canvas) {
      return;
    }
    try {
      const updated = await updateCanvasTemplate(template.id, {
        name: template.name,
        description: canvas.description || template.description || "",
        cards: canvas.cards || [],
        edges: canvas.edges || [],
        viewport: canvas.viewport || { x: 40, y: 40, zoom: 0.82 },
        metadata: canvas.metadata || template.metadata || {},
      });
      setCanvasTemplates((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setNotice(`Updated template ${updated.name} from the current board.`);
    } catch (templateError) {
      setError(templateError.message);
    }
  }

  async function handleDeleteCanvasTemplate(template) {
    if (!template) {
      return;
    }
    const confirmed = window.confirm(`Delete template "${template.name}"?`);
    if (!confirmed) {
      return;
    }
    try {
      await deleteCanvasTemplate(template.id);
      setCanvasTemplates((current) => current.filter((item) => item.id !== template.id));
      setNotice(`Deleted template ${template.name}.`);
    } catch (templateError) {
      setError(templateError.message);
    }
  }

  async function handleExportCanvasBoard(canvas) {
    if (!canvas) {
      return;
    }
    try {
      const payload = await exportCanvasBoard(canvas.id);
      setNotice(`Canvas exported to ${payload.path}`);
    } catch (exportError) {
      setError(exportError.message);
    }
  }

  async function handleSaveCanvasState(canvas, options = {}) {
    if (!canvas) {
      return;
    }
    const activeSnapshot = snapshotBundles[0] || activeResult?.snapshot_bundle || null;
    const { skipSave = false, label = `${canvas.name} board state`, silent = false } = options;
    try {
      if (!skipSave) {
        await handleSaveCanvas(canvas, null, { silent: true });
      }
      const snapshot = await createCanvasSnapshot(canvas.id, {
        label,
        snapshot_bundle_id: activeSnapshot?.id || null,
        snapshot_bundle_label: activeSnapshot?.label || null,
      });
      setSnapshots((current) => [snapshot, ...current.filter((item) => item.id !== snapshot.id)]);
      if (!silent) {
        setNotice(`Saved board state for ${canvas.name}.`);
      }
    } catch (snapshotError) {
      setError(snapshotError.message);
    }
  }

  async function handleSaveCanvas(canvasPayload, cards, options = {}) {
    if (!canvasPayload) {
      return;
    }
    const { silent = false } = options;
    try {
      const canvas = cards
        ? {
            ...canvasPayload,
            cards,
          }
        : canvasPayload;
      const saved = await updateCanvas(canvas.id, {
        name: canvas.name,
        description: canvas.description || "",
        cards: canvas.cards || [],
        edges: canvas.edges || [],
        viewport: canvas.viewport || { x: 0, y: 0, zoom: 1 },
        metadata: canvas.metadata || {},
      });
      setCanvases((current) => current.map((item) => (item.id === saved.id ? saved : item)));
      if (!silent) {
        setNotice(`Saved canvas ${saved.name}.`);
      }
    } catch (canvasError) {
      setError(canvasError.message);
    }
  }

  function resolveCanvasScope(scope) {
    const selectedFiles = uniqueValues(scope?.selected_files ?? []);
    return {
      selected_files: selectedFiles,
      label: scope?.label || "Canvas scope",
      description: scope?.description || "",
      canvas_id: scope?.canvas_id || "",
      card_count: scope?.card_count || 0,
      selected_card_labels: scope?.selected_card_labels ?? [],
      selected_card_ids: scope?.selected_card_ids ?? [],
      note_card_count: scope?.note_card_count || 0,
      group_card_count: scope?.group_card_count || 0,
      link_count: scope?.link_count || 0,
      build_goal: scope?.build_goal || "",
      allowed_targets: uniqueValues(scope?.allowed_targets ?? []),
      forbidden_paths: uniqueValues(scope?.forbidden_paths ?? []),
      workflow: scope?.workflow || "research-synthesis",
      review_notes: scope?.review_notes || "",
      snapshot_label: scope?.snapshot_label || "",
    };
  }

  async function handleDeleteCanvas(canvas) {
    if (!canvas || canvases.length <= 1) {
      setError("Keep at least one canvas board available.");
      return;
    }
    const confirmed = window.confirm(`Delete canvas "${canvas.name}"?`);
    if (!confirmed) {
      return;
    }
    try {
      await deleteCanvas(canvas.id);
      const nextCanvases = canvases.filter((item) => item.id !== canvas.id);
      setCanvases(nextCanvases);
      setSelectedCanvasId(nextCanvases[0]?.id || "");
      setNotice(`Deleted canvas ${canvas.name}.`);
    } catch (canvasError) {
      setError(canvasError.message);
    }
  }

  async function handleDuplicateCanvas(canvas) {
    if (!canvas) {
      return;
    }
    try {
      const idMap = new Map();
      const duplicatedCards = (canvas.cards || []).map((card, index) => {
        const nextId = crypto.randomUUID();
        idMap.set(card.id, nextId);
        return {
          ...card,
          id: nextId,
          x: Number(card.x || 0) + 40 + index * 6,
          y: Number(card.y || 0) + 30 + index * 4,
        };
      });
      const duplicate = await createCanvas({
        name: `${canvas.name} copy`,
        description: canvas.description || "",
        cards: duplicatedCards,
        edges: (canvas.edges || [])
          .map((edge) => ({
            ...edge,
            id: crypto.randomUUID(),
            from_card: idMap.get(edge.from_card),
            to_card: idMap.get(edge.to_card),
          }))
          .filter((edge) => edge.from_card && edge.to_card),
        viewport: canvas.viewport || { x: 0, y: 0, zoom: 1 },
        metadata: canvas.metadata || {},
      });
      setCanvases((current) => [...current, duplicate]);
      setSelectedCanvasId(duplicate.id);
      setNotice(`Duplicated canvas ${canvas.name}.`);
    } catch (canvasError) {
      setError(canvasError.message);
    }
  }

  async function handleAddGraphNodeToCanvas(node) {
    const targetCanvas = canvases.find((canvas) => canvas.id === selectedCanvasId) || canvases[0];
    if (!targetCanvas || !node) {
      return;
    }
    const file =
      fileLookup.get(node.id) ||
      fileLookup.get(node.file_id) ||
      files.find((item) => item.original_path === node.path || (item.rel_path === node.rel_path && item.source_name === node.source)) ||
      null;
    const nextCard = createCanvasCardFromGraphNode(node, file, (targetCanvas.cards || []).length);
    await handleSaveCanvas({
      ...targetCanvas,
      cards: [...(targetCanvas.cards || []), nextCard],
      edges: targetCanvas.edges || [],
      viewport: targetCanvas.viewport || { x: 40, y: 40, zoom: 0.82 },
    });
    setSelectedCanvasId(targetCanvas.id);
    openExploreTab(preferredExploreLane, exploreTabIdForView(preferredExploreLane, "canvas"));
    setNotice(`Added ${nextCard.label} to ${targetCanvas.name}.`);
  }

  async function handleSendFileToCanvas(file) {
    const targetCanvas = canvases.find((canvas) => canvas.id === selectedCanvasId) || canvases[0];
    if (!targetCanvas || !file) {
      return;
    }
    await handleSaveCanvas({
      ...targetCanvas,
      cards: [
        ...(targetCanvas.cards || []),
        {
          id: crypto.randomUUID(),
          type: "file",
          label: file.label,
          path: file.original_path,
          file_id: file.id,
          text: file.summary || file.rel_path || "",
          note: "",
          x: 140 + (targetCanvas.cards || []).length * 18,
          y: 140 + (targetCanvas.cards || []).length * 16,
          width: 340,
          height: 220,
          color: "violet",
          locked: false,
        },
      ],
      edges: targetCanvas.edges || [],
      viewport: targetCanvas.viewport || { x: 40, y: 40, zoom: 0.82 },
    });
    setSelectedCanvasId(targetCanvas.id);
    openExploreTab(preferredExploreLane, exploreTabIdForView(preferredExploreLane, "canvas"));
    setNotice(`Added ${file.label} to ${targetCanvas.name}.`);
  }

  async function handleSaveCanvasScope(scope) {
    const resolvedScope = resolveCanvasScope(scope);
    if (!resolvedScope.selected_files.length) {
      setError("This scope does not include any files yet.");
      return;
    }
    const activeSnapshot = snapshotBundles[0] || activeResult?.snapshot_bundle || null;
    try {
      const bookmark = await createBookmark({
        type: "canvas",
        label: resolvedScope.label,
        metadata: {
          ...resolvedScope,
          lane: preferredExploreLane,
          snapshot_bundle_id: activeSnapshot?.id || null,
          snapshot_label: activeSnapshot?.label || null,
        },
      });
      setBookmarks((current) => [bookmark, ...current.filter((item) => item.id !== bookmark.id)]);
      setNotice(`Saved scope ${resolvedScope.label}.`);
    } catch (bookmarkError) {
      setError(bookmarkError.message);
    }
  }

  async function handleSaveCanvasScopeAsPreset(scope) {
    const resolvedScope = resolveCanvasScope(scope);
    if (!resolvedScope.selected_files.length) {
      setError("This scope does not include any files yet.");
      return;
    }
    try {
      const scopedConfig = buildScopedConfigFromFiles(config, activeResult?.files ?? files, resolvedScope.selected_files);
      const preset = await createPreset({
        name: `Build scope: ${resolvedScope.label}`,
        description: `Reusable Build preset generated from canvas scope ${resolvedScope.label}.`,
        config: scopedConfig,
      });
      setPresets((current) => [preset, ...current.filter((item) => item.id !== preset.id)]);
      setNotice(`Saved Build preset from ${resolvedScope.label}.`);
    } catch (presetError) {
      setError(presetError.message);
    }
  }

  async function handlePromoteCanvasScope(scope, seedKind) {
    const resolvedScope = resolveCanvasScope(scope);
    if (!resolvedScope.selected_files.length) {
      setError("This scope does not include any files yet.");
      return;
    }
    const activeSnapshot = snapshotBundles[0] || activeResult?.snapshot_bundle || null;
    const labelPrefixMap = {
      memory: "Memory",
      decision: "Decision",
      topic: "Topic",
      task: "Task",
    };
    const labelPrefix = labelPrefixMap[seedKind] || "Memory";
    try {
      const record = await createDigitalBrainRecord({
        kind: seedKind,
        title: `${labelPrefix}: ${resolvedScope.label}`,
        summary: resolvedScope.description || `${labelPrefix} promoted from canvas scope.`,
        selected_files: resolvedScope.selected_files,
        source_scope_label: resolvedScope.label,
        canvas_id: resolvedScope.canvas_id || null,
        snapshot_bundle_id: activeSnapshot?.id || null,
        snapshot_bundle_label: activeSnapshot?.label || null,
        status: "promoted",
        confidence: seedKind === "decision" ? 0.74 : seedKind === "task" ? 0.68 : 0.7,
        metadata: {
          selected_card_labels: resolvedScope.selected_card_labels,
          card_count: resolvedScope.card_count,
          link_count: resolvedScope.link_count,
          build_goal: resolvedScope.build_goal || "",
        },
      });
      setDigitalBrainRecords((current) => [record, ...current.filter((item) => item.id !== record.id)]);
      setNotice(`Promoted ${resolvedScope.label} to Digital Brain ${seedKind}.`);
    } catch (bookmarkError) {
      setError(bookmarkError.message);
    }
  }

  async function handleUpdateDigitalBrainRecord(record, updates) {
    if (!record) {
      return;
    }
    try {
      const updated = await updateDigitalBrainRecord(record.id, {
        kind: record.kind,
        title: updates.title ?? record.title,
        summary: updates.summary ?? record.summary,
        selected_files: updates.selected_files ?? record.selected_files ?? [],
        source_scope_label: updates.source_scope_label ?? record.source_scope_label ?? "",
        canvas_id: updates.canvas_id ?? record.canvas_id ?? null,
        snapshot_bundle_id: updates.snapshot_bundle_id ?? record.snapshot_bundle_id ?? null,
        snapshot_bundle_label: updates.snapshot_bundle_label ?? record.snapshot_bundle_label ?? null,
        status: updates.status ?? record.status ?? "promoted",
        confidence: updates.confidence ?? record.confidence ?? 0.72,
        review_status: updates.review_status ?? record.review_status ?? "new",
        provenance_notes: updates.provenance_notes ?? record.provenance_notes ?? "",
        metadata: updates.metadata ?? record.metadata ?? {},
      });
      setDigitalBrainRecords((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedBrainRecordId(updated.id);
      setNotice(`Updated ${updated.title}.`);
    } catch (recordError) {
      setError(recordError.message);
    }
  }

  async function handleDeleteDigitalBrainRecord(record) {
    if (!record) {
      return;
    }
    const confirmed = window.confirm(`Delete ${record.title}?`);
    if (!confirmed) {
      return;
    }
    try {
      await deleteDigitalBrainRecord(record.id);
      setDigitalBrainRecords((current) => current.filter((item) => item.id !== record.id));
      if (selectedBrainRecordId === record.id) {
        setSelectedBrainRecordId("");
      }
      setNotice(`Deleted ${record.title}.`);
    } catch (recordError) {
      setError(recordError.message);
    }
  }

  async function handleSaveCurrentBrainView() {
    const defaultLabel = selectedFocusNode?.label
      ? `Focus: ${selectedFocusNode.label}`
      : selectedBrainRecord?.title
        ? `Record: ${selectedBrainRecord.title}`
        : "Digital Brain focus";
    const label = window.prompt("Cognitive view name", defaultLabel);
    if (!label) {
      return;
    }
    const metadata = {
      lane: "digital-brain",
      preferred_view: selectedBrainRecord?.kind === "decision" ? "decisions" : "focus",
      anchor_node_id: selectedFocusNode?.id || "",
      anchor_file_rel_path: selectedFile?.rel_path || "",
      focus_node_label: selectedFocusNode?.label || "",
      record_id: selectedBrainRecord?.id || "",
      graph_density: config.digital_brain.graph_density,
      node_count: digitalBrainFocusGraph?.summary?.node_count || 0,
      edge_count: digitalBrainFocusGraph?.summary?.edge_count || 0,
      why: selectedFocusNode?.why_surfaced || [],
    };
    try {
      const bookmark = await createBookmark({
        type: "brain_view",
        label,
        metadata,
      });
      setBookmarks((current) => [bookmark, ...current.filter((item) => item.id !== bookmark.id)]);
      setNotice(`Saved cognitive view ${label}.`);
    } catch (bookmarkError) {
      setError(bookmarkError.message);
    }
  }

  function selectFile(file) {
    setSelectedFile(file);
    setQuickOpen(false);
    openExploreTab(preferredExploreLane, exploreTabIdForView(preferredExploreLane, "notes"));
  }

  function selectGraphNode(node) {
    setSelectedFocusNodeId(node?.id || "");
    const file = fileLookup.get(node.id) || fileLookup.get(node.file_id) || null;
    if (file) {
      setSelectedFile(file);
      setQuickOpen(false);
      return;
    }
    setSelectedFile(null);
  }

  function handleOpenCanvasFile(card) {
    if (!card?.file_id && !card?.path) {
      return;
    }
    const file =
      (card.file_id ? fileLookup.get(card.file_id) : null) ||
      files.find((item) => item.original_path === card.path) ||
      null;
    if (file) {
      selectFile(file);
    }
  }

  function selectBookmark(bookmark) {
    if (bookmark.type === "file") {
      const match = files.find((file) => file.original_path === bookmark.path || file.id === bookmark.file_id);
      if (match) {
        selectFile(match);
      }
      return;
    }
    if (bookmark.type === "canvas") {
      const scope = resolveCanvasScope(bookmark.metadata || {});
      const targetLane = bookmark.metadata?.lane === "digital-brain" ? "digital-brain" : "structure";
      if (scope.canvas_id) {
        setSelectedCanvasId(scope.canvas_id);
      }
      setActiveBuildScope(scope);
      openExploreTab(targetLane, exploreTabIdForView(targetLane, "canvas"));
      setNotice(`Loaded saved scope ${scope.label}.`);
      return;
    }
    if (bookmark.type === "brain_view") {
      const metadata = bookmark.metadata || {};
      if (metadata.record_id) {
        setSelectedBrainRecordId(metadata.record_id);
      }
      if (metadata.anchor_node_id) {
        setSelectedFocusNodeId(metadata.anchor_node_id);
      }
      if (metadata.anchor_file_rel_path) {
        const match = files.find((file) => file.rel_path === metadata.anchor_file_rel_path);
        if (match) {
          setSelectedFile(match);
        }
      }
      openExploreTab("digital-brain", metadata.preferred_view || "focus");
      setNotice(`Opened saved cognitive view ${bookmark.label}.`);
    }
  }

  function selectDigitalBrainRecord(record) {
    if (!record) {
      return;
    }
    setSelectedBrainRecordId(record.id);
    const scope = resolveCanvasScope({
      selected_files: record.selected_files || [],
      label: record.title,
      description: record.summary || "",
      canvas_id: record.canvas_id || "",
    });
    setActiveBuildScope(scope);
    const firstRelPath = record.selected_files?.[0];
    if (firstRelPath) {
      const file = files.find((item) => item.rel_path === firstRelPath);
      if (file) {
        setSelectedFile(file);
      }
    }
    openExploreTab("digital-brain", record.kind === "decision" ? "decisions" : "memory");
  }

  const latestSnapshotBundle = snapshotBundles[0] || activeResult?.snapshot_bundle || null;
  const previousSnapshotBundle = snapshotBundles[1] || null;
  const latestLogicProfile = logicProfiles[0] || null;
  const latestExplainBundle = explainBundles[0] || null;
  const latestPatchPreview = buildPatchPreviews[0] || null;
  const latestApplyRun = buildApplyRuns[0] || null;
  const latestParallelProfile = parallelScanProfiles[0] || null;
  const latestDeltaSnapshot = deltaSnapshots[0] || null;
  const logicWorkerCount = workerCountForProfile(logicWorkerProfile);
  const activeSubTab =
    isExploreLane
      ? activeExploreTab
      : mainTab === "logic"
        ? logicTab
        : mainTab === "explain"
          ? explainTab
        : buildTab;
  const scopeCompareLeft = canvasScopeBookmarks.find((item) => item.id === scopeCompareLeftId) || null;
  const scopeCompareRight = canvasScopeBookmarks.find((item) => item.id === scopeCompareRightId) || null;
  const scopeComparison = useMemo(() => {
    if (!scopeCompareLeft || !scopeCompareRight) {
      return null;
    }
    return buildSavedScopeComparison(scopeCompareLeft, scopeCompareRight);
  }, [scopeCompareLeft, scopeCompareRight]);
  const activeBuildScopeChecks = useMemo(() => {
    if (!activeBuildScope) {
      return [];
    }
    return [
      { id: "files", label: "Scope has files", pass: (activeBuildScope.selected_files?.length ?? 0) > 0 },
      { id: "goal", label: "Board goal is present", pass: Boolean(activeBuildScope.build_goal?.trim()) },
      { id: "targets", label: "Allowed targets are present", pass: Boolean(activeBuildScope.allowed_targets?.length) },
      { id: "review", label: "Review notes are present", pass: Boolean(activeBuildScope.review_notes?.trim()) },
    ];
  }, [activeBuildScope]);

  function handleMainTabChange(tabId) {
    if (tabId === "structure") {
      openExploreTab("structure", structureTab);
      return;
    }
    if (tabId === "digital-brain") {
      openExploreTab("digital-brain", digitalBrainTab);
      return;
    }
    setMainTab(tabId);
  }

  function handleSubTabChange(tabId) {
    if (isExploreLane) {
      openExploreTab(activeExploreLane, tabId);
      return;
    }
    if (mainTab === "logic") {
      setLogicTab(tabId);
      return;
    }
    if (mainTab === "explain") {
      setExplainTab(tabId);
      return;
    }
    setBuildTab(tabId);
  }

  const structureActions = (
    <>
      <button className="secondary-button" type="button" onClick={handleAddFolderByBrowse} disabled={!!busy}>
        Add folder
      </button>
      <button className="secondary-button" type="button" onClick={() => startWorkspaceJob("refresh")} disabled={!!busy || !buildResult}>
        {busy === "refresh" ? "Refreshing..." : "Refresh model"}
      </button>
      <button className="secondary-button" type="button" onClick={() => startWorkspaceJob("preview")} disabled={!!busy}>
        {busy === "preview" ? "Previewing..." : "Preview"}
      </button>
      <button className="primary-button" type="button" onClick={() => startWorkspaceJob("build")} disabled={!!busy}>
        {busy === "build" ? "Building..." : "Build"}
      </button>
    </>
  );

  const logicActions = (
    <>
      <button className="secondary-button" type="button" onClick={handleRunParallelProfile} disabled={!!busy}>
        Parallel scan ({logicWorkerCount})
      </button>
      <button className="primary-button" type="button" onClick={handleRunLogicProfile} disabled={!!busy}>
        Run logic ({logicWorkerCount})
      </button>
    </>
  );

  const explainActions = (
    <>
      <button className="secondary-button" type="button" onClick={handleCompareSnapshots} disabled={!!busy || !previousSnapshotBundle}>
        Compare snapshots
      </button>
      <button className="primary-button" type="button" onClick={handleCreateExplainBundle} disabled={!!busy}>
        Create explain bundle
      </button>
    </>
  );

  const buildActions = (
    <>
      <button className="secondary-button" type="button" onClick={handleApplyPatchPreview} disabled={!!busy || !latestPatchPreview}>
        Apply latest
      </button>
      <button className="primary-button" type="button" onClick={handleCreatePatchPreview} disabled={!!busy}>
        Create patch preview
      </button>
    </>
  );

  return (
    <div className="app-shell">
      <QuickSwitcher
        open={quickOpen}
        query={quickQuery}
        results={searchResults}
        onClose={() => setQuickOpen(false)}
        onQueryChange={setQuickQuery}
        onSelect={selectFile}
      />

      <aside className="sidebar">
        <div className="sidebar__brand">
          <div className="brand-mark">CV</div>
          <div>
            <span className="eyebrow">Structure / Logic / Explain / Build / Digital brain</span>
            <h1>Context Vault Studio</h1>
          </div>
        </div>

        {isExploreLane ? (
          <>
            {activeExploreView === "setup" ? (
              <>
                <div className="sidebar__panel">
                  <div className="panel__header">
                    <div>
                      <span className="eyebrow">Templates</span>
                      <h3>Start with something that works</h3>
                    </div>
                  </div>
                  <div className="example-stack">
                    {examples.map((example) => (
                      <button
                        key={example.id}
                        className="example-card"
                        type="button"
                        onClick={() => handleLoadExample(example, example.id === "guided-demo")}
                      >
                        <strong>{example.label}</strong>
                        <span>{example.description}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {activeExploreLane === "digital-brain" ? (
                  <div className="sidebar__panel">
                    <span className="eyebrow">Canonical index</span>
                    <div className="sidebar-card-stack">
                      <div className="sidebar-card sidebar-card--static">
                        <strong>{latestDigitalBrainIndex?.label || "No Digital Brain index yet"}</strong>
                        <span>
                          {latestDigitalBrainIndex
                            ? `${latestDigitalBrainIndex.source_object_count} source objects, ${latestDigitalBrainIndex.episode_count} episodes`
                            : "Run preview to create the first canonical index."}
                        </span>
                        <em>
                          {latestDigitalBrainIndex
                            ? `${latestDigitalBrainIndex.graph_node_count} graph nodes, ${latestDigitalBrainIndex.memory_candidate_count} memory candidates`
                            : "Source adapters + canonical storage"}
                        </em>
                      </div>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
            {activeExploreView === "notes" ? (
              <>
                <div className="sidebar__panel">
                  <span className="eyebrow">{activeExploreLane === "digital-brain" ? "Memory" : "Notes"}</span>
                  <p className="sidebar-copy">
                    {activeExploreLane === "digital-brain"
                      ? "Browse the approved files and notes currently acting as first-pass memory candidates."
                      : "Browse matched files, follow links, and edit the scoped notes that made it into the current workspace."}
                  </p>
                </div>
                <BookmarkPanel bookmarks={bookmarks} onSelectBookmark={selectBookmark} />
                <SnapshotPanel snapshots={snapshots} onRestore={handleRestoreSnapshot} />
              </>
            ) : null}
            {activeExploreView === "canvas" ? (
              <>
                <div className="sidebar__panel">
                  <span className="eyebrow">Canvas tips</span>
                  <ul className="sidebar-list">
                    <li>Select a file in Notes, then add it to the board.</li>
                    <li>Use text cards for rough ideas and file cards for anchored context.</li>
                    <li>Save the board after arranging cards.</li>
                  </ul>
                </div>
                <BookmarkPanel bookmarks={bookmarks} onSelectBookmark={selectBookmark} />
              </>
            ) : null}
            {activeExploreView === "graph" ? (
              <>
                <div className="sidebar__panel">
                  <span className="eyebrow">{activeExploreLane === "digital-brain" ? "Focus tips" : "Graph tips"}</span>
                  <ul className="sidebar-list">
                    <li>Preview or build first so the graph has real nodes.</li>
                    <li>{activeExploreLane === "digital-brain" ? "Use Focus to center what matters most right now." : "Use the graph to choose what to open next."}</li>
                    <li>Click a node to jump directly into notes.</li>
                  </ul>
                </div>
                <div className="sidebar__panel">
                  <span className="eyebrow">{activeExploreLane === "digital-brain" ? "Current focus" : "Current map"}</span>
                  <div className="sidebar-card-stack">
                    <div className="sidebar-card sidebar-card--static">
                      <strong>{activeExploreLane === "digital-brain" ? digitalBrainFocusGraph?.summary?.node_count ?? 0 : activeResult?.summary?.file_count ?? 0} {activeExploreLane === "digital-brain" ? "nodes" : "files"}</strong>
                      <span>{activeExploreLane === "digital-brain" ? digitalBrainFocusGraph?.summary?.edge_count ?? 0 : activeResult?.summary?.edge_count ?? 0} edges</span>
                      <em>{activeResult ? (activeExploreLane === "digital-brain" ? "Ready to interpret" : "Ready to explore") : "No result yet"}</em>
                    </div>
                  </div>
                </div>
              </>
            ) : null}
            {activeExploreView === "history" || activeExploreView === "saved" || activeExploreView === "advanced" || activeExploreView === "decisions" ? (
              <div className="sidebar__panel">
                <span className="eyebrow">Artifact summary</span>
                <p className="sidebar-copy">
                  Snapshot bundles: {snapshotBundles.length}
                </p>
                <div className="sidebar-meta">
                  <span>Delta snapshots: {deltaSnapshots.length}</span>
                  <span>Patch previews: {buildPatchPreviews.length}</span>
                  <span>Apply runs: {buildApplyRuns.length}</span>
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {mainTab === "logic" ? (
          <div className="sidebar__panel">
            <span className="eyebrow">Latest logic profile</span>
            <div className="field-grid">
              <label className="field-grid__wide">
                <span>Worker mode</span>
                <select value={logicWorkerProfile} onChange={(event) => setLogicWorkerProfile(event.target.value)}>
                  <option value="default">Default ({DEFAULT_WORKER_COUNT} workers)</option>
                  <option value="aggressive">Aggressive ({workerCountForProfile("aggressive")} workers)</option>
                </select>
              </label>
            </div>
            <p className="microcopy">
              Logic and Parallel scan both use this mode. Default keeps more headroom; aggressive spends more of the shared worker budget.
            </p>
            <div className="sidebar-card-stack">
              <div className="sidebar-card sidebar-card--static">
                <strong>{latestLogicProfile?.label || "No logic profile yet"}</strong>
                <span>{latestLogicProfile ? `${latestLogicProfile.file_count} files profiled` : "Run Logic profile to generate code signals."}</span>
                <em>{latestLogicProfile ? `${latestLogicProfile.import_count} imports, ${latestLogicProfile.symbol_count} symbols` : "First-pass code mapper"}</em>
              </div>
              <div className="sidebar-card sidebar-card--static">
                <strong>Parallel scan</strong>
                <span>{latestParallelProfile ? latestParallelProfile.label : "Not generated yet"}</span>
                <em>{latestParallelProfile ? `${latestParallelProfile.file_count} files, ${latestParallelProfile.worker_count} workers` : "Thread + process foundation"}</em>
              </div>
            </div>
          </div>
        ) : null}

        {mainTab === "explain" ? (
          <div className="sidebar__panel">
            <span className="eyebrow">Latest explain bundle</span>
            <div className="sidebar-card-stack">
              <div className="sidebar-card sidebar-card--static">
                <strong>{latestExplainBundle?.label || "No explain bundle yet"}</strong>
                <span>{latestExplainBundle ? `${latestExplainBundle.top_file_count} top files` : "Create an Explain bundle from the current snapshot."}</span>
                <em>{latestExplainBundle ? `${latestExplainBundle.top_symbol_count} top symbols` : "Architecture handoff layer"}</em>
              </div>
            </div>
          </div>
        ) : null}

        {mainTab === "build" ? (
          <div className="sidebar__panel">
            <span className="eyebrow">Build status</span>
            <div className="sidebar-card-stack">
              <div className="sidebar-card sidebar-card--static">
                <strong>{latestPatchPreview?.label || "No patch preview yet"}</strong>
                <span>{latestPatchPreview ? `${latestPatchPreview.copied_file_count} scoped inputs` : "Create a scoped deterministic preview first."}</span>
                <em>{latestPatchPreview ? `${latestPatchPreview.warning_count} warnings, ${latestPatchPreview.error_count} errors` : "Patch gate"}</em>
              </div>
              <div className="sidebar-card sidebar-card--static">
                <strong>{latestApplyRun?.label || "No apply run yet"}</strong>
                <span>{latestApplyRun ? "Scratch apply completed" : "Apply runs stay in scratch space."}</span>
                <em>{latestApplyRun ? latestApplyRun.preview_id : "Safe reconciliation loop"}</em>
              </div>
            </div>
          </div>
        ) : null}
      </aside>

      <main className="workspace">
        <div className={`workspace-header workspace-header--${mainTab}`}>
          <div className="window-bar">
            <span className="window-dot" />
            <span className="window-dot" />
            <span className="window-dot" />
            <div className="window-tabs">
              {MAIN_TABS.map((tab) => (
                <button
                  key={tab.id}
                  className={`window-tab window-tab--${tab.id} ${mainTab === tab.id ? "window-tab--active" : ""}`}
                  type="button"
                  onClick={() => handleMainTabChange(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <SubtabBar tabs={SUB_TABS[mainTab]} activeTab={activeSubTab} onSelect={handleSubTabChange} />
        </div>

        {error ? <div className="callout callout--error">{error}</div> : null}
        {notice ? <div className="callout callout--success">{notice}</div> : null}
        {busy === "boot" ? <div className="callout">Loading workspace…</div> : null}
        {activeJobId ? (
          <>
            <div className="callout">
              {(activeJob?.message || "Working")} {activeJob?.progress ?? 0}%
            </div>
            <section className="panel panel--tight job-telemetry">
              <div className="panel__header panel__header--spread">
                <div>
                  <span className="eyebrow">Worker telemetry</span>
                  <h3>Live execution budget</h3>
                </div>
                <span className="microcopy">{activeJob?.worker_profile || "default"} profile</span>
              </div>
              <div className="metrics-grid">
                <MetricCard label="Reserved budget" value={activeJob?.telemetry?.reserved_budget ?? 0} hint={`of ${activeJob?.telemetry?.budget_cap ?? 0}`} />
                <MetricCard label="Active processes" value={activeJob?.telemetry?.active_processes ?? 0} hint="Process workers" />
                <MetricCard label="Active threads" value={activeJob?.telemetry?.active_threads ?? 0} hint="Thread workers" />
                <MetricCard label="Current stage" value={activeJob?.telemetry?.current_stage || "running"} hint="Live job stage" />
              </div>
            </section>
          </>
        ) : null}
        {!activeJobId && latestJob?.status === "failed" ? (
          <div className="callout callout--error">Last job failed: {latestJob.error || latestJob.message}</div>
        ) : null}

        {isExploreLane && activeExploreView === "setup" ? (
          <>
            <LaneHeader lane={activeExploreLane} actions={structureActions} />
            <section className="structure-setup-grid">
              <div className="structure-setup-main">
                {activeResult ? (
                  <ResultSpotlight
                    result={activeResult}
                    outputDir={buildResult?.artifacts?.vault_dir}
                    snapshotBundle={activeResult?.snapshot_bundle || snapshotBundles[0]}
                    onOpenNotes={() => openExploreTab(activeExploreLane, exploreTabIdForView(activeExploreLane, "notes"))}
                    onOpenGraph={() => openExploreTab(activeExploreLane, exploreTabIdForView(activeExploreLane, "graph"))}
                  />
                ) : (
                  <section className="panel panel--spotlight">
                    <div className="panel__header">
                      <div>
                        <span className="eyebrow">Current result</span>
                        <h3>No workspace result yet</h3>
                      </div>
                    </div>
                    <p className="empty-copy">
                      {activeExploreLane === "digital-brain"
                        ? "Load the guided demo from Templates or add approved folders, then use `Preview` to build the first selective cognitive graph."
                        : "Load the guided demo from Templates or add a folder or disk, then use the top-right `Preview` button to populate Structure."}
                    </p>
                  </section>
                )}
                <section className="panel">
                  <div className="panel__header panel__header--spread">
                    <div>
                      <span className="eyebrow">Setup</span>
                      <h3>
                        {activeExploreLane === "digital-brain"
                          ? "Choose the approved sources Digital Brain should prioritize"
                          : "Choose the folders Structure is allowed to map"}
                      </h3>
                    </div>
                    <div className="hero__actions hero__actions--tight">
                      <button className="primary-button" type="button" onClick={handleAddFolderByBrowse}>
                        Add folder
                      </button>
                      <button className="ghost-button" type="button" onClick={() => openExploreTab(activeExploreLane, exploreTabIdForView(activeExploreLane, "advanced"))}>
                        Advanced
                      </button>
                    </div>
                  </div>
                  {config.sources.length ? (
                    <div className="source-stack">
                      {config.sources.map((source, index) => (
                        <SourceCard
                          key={`${source.name || "source"}-${index}`}
                          source={source}
                          index={index}
                          onChange={updateSource}
                          onRemove={removeSource}
                          onBrowse={handleBrowseFolder}
                          inspectResult={inspectResults[index]}
                          inspectBusy={inspectBusyIndex === index}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyTabState
                      title="Nothing has been scoped yet"
                      body="Load the guided demo if you want something that works immediately, or add your own folder or disk."
                      actions={[
                        guidedDemo
                          ? {
                              label: "Load guided demo",
                              onClick: () => handleLoadExample(guidedDemo, true),
                              primary: true,
                            }
                          : { label: "Add folder", onClick: handleAddFolderByBrowse, primary: true },
                        { label: "Add folder", onClick: handleAddFolderByBrowse },
                      ]}
                    />
                  )}
                </section>
              </div>

              <div className="structure-setup-side">
                {activeExploreLane === "digital-brain" ? (
                  <section className="panel">
                    <div className="panel__header">
                      <div>
                        <span className="eyebrow">Digital brain setup</span>
                        <h3>Choose how the cognitive layer should index this workspace</h3>
                      </div>
                    </div>
                    <div className="field-grid">
                      <label>
                        <span>Scan mode</span>
                        <select
                          value={config.digital_brain.scan_mode}
                          onChange={(event) => updateDigitalBrainField("scan_mode", event.target.value)}
                        >
                          <option value="quick_start">Quick Start</option>
                          <option value="project_priority">Project Priority</option>
                          <option value="broad_cognitive_index">Broad Cognitive Index</option>
                        </select>
                      </label>
                      <label>
                        <span>Graph density</span>
                        <select
                          value={config.digital_brain.graph_density}
                          onChange={(event) => updateDigitalBrainField("graph_density", event.target.value)}
                        >
                          <option value="concise">Concise</option>
                          <option value="balanced">Balanced</option>
                          <option value="rich">Rich</option>
                        </select>
                      </label>
                      <label className="field-grid__wide">
                        <span>Enrichment mode</span>
                        <select
                          value={config.digital_brain.enrichment_mode}
                          onChange={(event) => updateDigitalBrainField("enrichment_mode", event.target.value)}
                        >
                          <option value="background">Background deep pass</option>
                          <option value="on_demand">On-demand only</option>
                          <option value="surface_only">Surface pass only</option>
                        </select>
                      </label>
                      <label className="field-grid__wide">
                        <span>Retention mode</span>
                        <select
                          value={config.digital_brain.retention_mode}
                          onChange={(event) => updateDigitalBrainField("retention_mode", event.target.value)}
                        >
                          <option value="metadata_only">Metadata only</option>
                          <option value="extracted_text">Extracted text</option>
                          <option value="cached_content">Cached content</option>
                        </select>
                      </label>
                      <label>
                        <span>Workspace file sync policy</span>
                        <select
                          value={config.digital_brain.workspace_file_sync_policy}
                          onChange={(event) => updateDigitalBrainField("workspace_file_sync_policy", event.target.value)}
                        >
                          <option value="surface_only">Surface only</option>
                          <option value="metadata_then_focus">Metadata then focus</option>
                          <option value="always_deepen">Always deepen</option>
                        </select>
                      </label>
                      <label>
                        <span>Notes sync policy</span>
                        <select
                          value={config.digital_brain.notes_sync_policy}
                          onChange={(event) => updateDigitalBrainField("notes_sync_policy", event.target.value)}
                        >
                          <option value="disabled">Disabled</option>
                          <option value="surface_only">Surface only</option>
                          <option value="metadata_then_focus">Metadata then focus</option>
                          <option value="always_deepen">Always deepen</option>
                        </select>
                      </label>
                      <label>
                        <span>Recent activity policy</span>
                        <select
                          value={config.digital_brain.recent_activity_sync_policy}
                          onChange={(event) => updateDigitalBrainField("recent_activity_sync_policy", event.target.value)}
                        >
                          <option value="disabled">Disabled</option>
                          <option value="ranking_only">Ranking only</option>
                          <option value="metadata_then_focus">Metadata then focus</option>
                        </select>
                      </label>
                      <label>
                        <span>Chat sync policy</span>
                        <select
                          value={config.digital_brain.chat_sync_policy}
                          onChange={(event) => updateDigitalBrainField("chat_sync_policy", event.target.value)}
                        >
                          <option value="planned">Planned</option>
                          <option value="disabled">Disabled</option>
                          <option value="metadata_then_focus">Metadata then focus</option>
                        </select>
                      </label>
                    </div>
                    <div className="graph-focus-group">
                      <span className="field-label">Priority categories</span>
                      <div className="graph-focus-chip-row">
                        {DIGITAL_BRAIN_CATEGORY_OPTIONS.map((item) => (
                          <button
                            key={item.id}
                            className={`graph-focus-chip ${(config.digital_brain.priority_categories ?? []).includes(item.id) ? "graph-focus-chip--active" : ""}`}
                            type="button"
                            onClick={() => toggleDigitalBrainCategory(item.id)}
                          >
                            <strong>{item.label}</strong>
                          </button>
                        ))}
                      </div>
                    </div>
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={config.digital_brain.prioritize_recent_files}
                        onChange={(event) => updateDigitalBrainField("prioritize_recent_files", event.target.checked)}
                      />
                      <span>Prioritize recent files when building the first Digital Brain graph.</span>
                    </label>
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={config.digital_brain.include_notes}
                        onChange={(event) => updateDigitalBrainField("include_notes", event.target.checked)}
                      />
                      <span>Include notes as first-class cognitive sources.</span>
                    </label>
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={config.digital_brain.include_chats}
                        onChange={(event) => updateDigitalBrainField("include_chats", event.target.checked)}
                      />
                      <span>Reserve room for chat-linked context as that connector lands.</span>
                    </label>
                    <p className="microcopy">
                      DB1 keeps the same approved workspace boundary as Structure, but these settings begin to steer Digital Brain toward selective, staged, high-value indexing.
                    </p>
                  </section>
                ) : null}
                {activeExploreLane === "digital-brain" ? (
                  <section className="panel">
                    <div className="panel__header">
                      <div>
                        <span className="eyebrow">DB4 attention policy</span>
                        <h3>Why each source class earns deeper reading</h3>
                      </div>
                    </div>
                    {digitalBrainSourcePriority.length ? (
                      <div className="summary-list">
                        {digitalBrainSourcePriority.map((entry) => (
                          <article className="summary-card" key={`${entry.source_id}-${entry.sync_policy}`}>
                            <div className="summary-card__header">
                              <div>
                                <span className="eyebrow">{entry.source_type}</span>
                                <h3>{entry.label}</h3>
                              </div>
                              <div className="summary-pill">{entry.sync_policy}</div>
                            </div>
                            <div className="microcopy">{entry.reason}</div>
                            <div className="chip-row">
                              <span className="path-chip">Priority {entry.priority_score}</span>
                              <span className="path-chip">{entry.status}</span>
                              <span className="path-chip">
                                {entry.deeper_read_eligible ? "Eligible for deeper reading" : "Surface-only for now"}
                              </span>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="empty-copy">Run preview so Digital Brain can compute the current source-class attention order.</p>
                    )}
                  </section>
                ) : null}
                {activeExploreLane === "digital-brain" ? (
                  <section className="panel">
                    <div className="panel__header">
                      <div>
                        <span className="eyebrow">DB2 foundation</span>
                        <h3>Source adapters and canonical storage</h3>
                      </div>
                    </div>
                    <div className="metrics-grid">
                      <MetricCard label="Adapters" value={digitalBrainAdapterContracts.length} hint="Registered source adapter contracts" />
                      <MetricCard label="Indexes" value={digitalBrainIndexes.length} hint="Saved canonical Digital Brain indexes" />
                      <MetricCard label="Objects" value={latestDigitalBrainIndex?.source_object_count ?? 0} hint="Normalized source objects" />
                      <MetricCard label="Episodes" value={latestDigitalBrainIndex?.episode_count ?? 0} hint="Canonical activity episodes" />
                      <MetricCard label="Focus nodes" value={digitalBrainFocusGraph?.summary?.node_count ?? 0} hint="Surface-pass cognitive graph" />
                      <MetricCard label="Memory shells" value={digitalBrainMemoryShells.length} hint="First-pass memory candidates" />
                    </div>
                    {digitalBrainAdapterContracts.length ? (
                      <div className="summary-list">
                        {digitalBrainAdapterContracts.map((contract) => (
                          <article className="summary-card" key={contract.adapter_id}>
                            <div className="summary-card__header">
                              <div>
                                <span className="eyebrow">{contract.source_type}</span>
                                <h3>{contract.label}</h3>
                              </div>
                              <div className="summary-pill">{contract.status}</div>
                            </div>
                            <div className="microcopy">{contract.notes}</div>
                            <div className="chip-row">
                              {(contract.capabilities || []).map((capability) => (
                                <span key={`${contract.adapter_id}-${capability}`} className="path-chip">
                                  {capability}
                                </span>
                              ))}
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="empty-copy">No source adapter contracts are visible yet.</p>
                    )}
                    <p className="microcopy">
                      DB2 stores normalized source records, episodes, content units, graph objects, and provenance in a canonical Digital Brain index attached to the current approved workspace.
                    </p>
                  </section>
                ) : null}
                <section className="panel">
                  <div className="panel__header">
                    <div>
                      <span className="eyebrow">Model workflow</span>
                      <h3>Build, refresh, and snapshot behavior</h3>
                    </div>
                  </div>
                  <div className="field-grid">
                    <label>
                      <span>Auto snapshot retention</span>
                      <input
                        type="number"
                        min="1"
                        value={config.model_workflow.auto_snapshot_retention}
                        onChange={(event) => updateModelWorkflowField("auto_snapshot_retention", Number(event.target.value) || 1)}
                      />
                    </label>
                  </div>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={config.model_workflow.auto_snapshot_after_build}
                      onChange={(event) => updateModelWorkflowField("auto_snapshot_after_build", event.target.checked)}
                    />
                    <span>Automatically create a model snapshot after build.</span>
                  </label>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={config.model_workflow.auto_snapshot_after_refresh}
                      onChange={(event) => updateModelWorkflowField("auto_snapshot_after_refresh", event.target.checked)}
                    />
                    <span>Automatically create a model snapshot after refresh.</span>
                  </label>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={config.model_workflow.auto_snapshot_on_monitored_changes}
                      onChange={(event) => updateModelWorkflowField("auto_snapshot_on_monitored_changes", event.target.checked)}
                    />
                    <span>Reserve autorun snapshots for monitored file changes later.</span>
                  </label>
                  <div className="artifact-note">
                    <strong>Auto-snapshot rules</strong>
                    <span>After build: creates an automatic model-state snapshot when enabled.</span>
                    <span>After refresh: creates an automatic model-state snapshot when enabled.</span>
                    <span>Monitored changes: reserved for later live-monitor integration.</span>
                    <span>Retention: keeps the newest auto model snapshots up to your limit; older auto model snapshots are pruned. Manual snapshots remain untouched.</span>
                  </div>
                  <p className="microcopy">
                    Preview is the dry run. Build creates and activates the working model. Refresh updates that active model without requiring a clean rebuild. Auto snapshots preserve model history so you can move backward and forward through versions.
                  </p>
                </section>
                <section className="panel">
                  <div className="panel__header panel__header--spread">
                    <div>
                      <span className="eyebrow">Sandbox</span>
                      <h3>Workspace boundary and output rules</h3>
                    </div>
                    <button className="secondary-button" type="button" onClick={handleCreateNote}>
                      New note
                    </button>
                  </div>
                  <div className="sandbox-overview">
                    <div className="sandbox-stat">
                      <span>Workspace</span>
                      <strong>{config.vault_name || "Untitled workspace"}</strong>
                      <small>{config.output_dir || "Choose an output folder for builds and graphs."}</small>
                    </div>
                    <div className="sandbox-stat">
                      <span>Build mode</span>
                      <strong>{config.default_mode === "symlink" ? "Symlink" : "Copy"}</strong>
                      <small>{config.default_mode === "symlink" ? "Convenience first" : "Hard curated boundary"}</small>
                    </div>
                    <div className="sandbox-stat">
                      <span>Workspace-only rules</span>
                      <strong>{blockedRuleCount}</strong>
                      <small>Only this workspace uses them.</small>
                    </div>
                    <div className="sandbox-stat">
                      <span>Global rules</span>
                      <strong>{globalBlockedRuleCount}</strong>
                      <small>Applied to every model in this app.</small>
                    </div>
                  </div>
                  <div className="sandbox-grid">
                    <article className="sandbox-card">
                      <div className="sandbox-card__header">
                        <div>
                          <span className="eyebrow">Destination</span>
                          <h4>Where the active model is stored</h4>
                        </div>
                      </div>
                      <div className="field-grid">
                        <label>
                          <span>Workspace name</span>
                          <input value={config.vault_name} onChange={(event) => updateField("vault_name", event.target.value)} />
                        </label>
                        <label>
                          <span>Folder to save graphs and builds</span>
                          <div className="path-field">
                            <input
                              value={config.output_dir}
                              onChange={(event) => updateField("output_dir", event.target.value)}
                              placeholder="../build/context-vault-studio"
                            />
                            <button className="secondary-button" type="button" onClick={handleBrowseOutputDirectory}>
                              Browse
                            </button>
                          </div>
                        </label>
                      </div>
                    </article>

                    <article className="sandbox-card">
                      <div className="sandbox-card__header">
                        <div>
                          <span className="eyebrow">Build defaults</span>
                          <h4>What gets copied into the model</h4>
                        </div>
                      </div>
                      <div className="field-grid">
                        <label>
                          <span>Default mode</span>
                          <select value={config.default_mode} onChange={(event) => updateField("default_mode", event.target.value)}>
                            <option value="copy">Copy</option>
                            <option value="symlink">Symlink</option>
                          </select>
                        </label>
                        <label>
                          <span>Max file size (bytes)</span>
                          <input
                            type="number"
                            min="1"
                            value={config.max_file_size_bytes}
                            onChange={(event) => updateField("max_file_size_bytes", Number(event.target.value) || 1)}
                          />
                        </label>
                        <label>
                          <span>Default include patterns</span>
                          <textarea
                            rows="4"
                            value={joinLines(config.default_include)}
                            onChange={(event) => updateField("default_include", splitLines(event.target.value))}
                            placeholder={"README.md\n**/*.md"}
                          />
                        </label>
                        <label>
                          <span>Default exclude patterns</span>
                          <textarea
                            rows="4"
                            value={joinLines(config.default_exclude)}
                            onChange={(event) => updateField("default_exclude", splitLines(event.target.value))}
                            placeholder={"node_modules/**\ndist/**"}
                          />
                        </label>
                      </div>
                    </article>

                    <article className="sandbox-card sandbox-card--wide">
                      <div className="sandbox-card__header sandbox-card__header--spread">
                        <div>
                          <span className="eyebrow">Workspace exclusions</span>
                          <h4>Hide or block paths only for this workspace</h4>
                        </div>
                        <div className="hero__actions hero__actions--tight">
                          <button className="secondary-button" type="button" onClick={() => handleAddBlockedByBrowse("directory")}>
                            Exclude folder / disk
                          </button>
                          <button className="secondary-button" type="button" onClick={() => handleAddBlockedByBrowse("file")}>
                            Exclude file
                          </button>
                        </div>
                      </div>
                      <p className="microcopy">
                        Use these for project-specific private folders, generated outputs, or temporary areas you do not want in this one model.
                      </p>
                      <BlockedPathList
                        blockedPaths={config.access.blocked_paths ?? []}
                        onRemove={removeBlockedPath}
                        emptyCopy="No workspace-only exclusions yet."
                      />
                      <label>
                        <span>Blocked patterns</span>
                        <textarea
                          rows="4"
                          value={joinLines(config.access.blocked_patterns)}
                          onChange={(event) => updateAccessField("blocked_patterns", splitLines(event.target.value))}
                          placeholder={"**/*.key\n**/drafts/private/**"}
                        />
                      </label>
                    </article>

                    <article className="sandbox-card sandbox-card--wide">
                      <div className="sandbox-card__header sandbox-card__header--spread">
                        <div>
                          <span className="eyebrow">Global exclusions</span>
                          <h4>Rules that apply to every model you build here</h4>
                        </div>
                        <div className="hero__actions hero__actions--tight">
                          <button className="ghost-button" type="button" onClick={restoreDefaultGlobalBlockedPatterns}>
                            Restore defaults
                          </button>
                          <button className="secondary-button" type="button" onClick={() => handleAddGlobalBlockedByBrowse("directory")}>
                            Exclude folder globally
                          </button>
                          <button className="secondary-button" type="button" onClick={() => handleAddGlobalBlockedByBrowse("file")}>
                            Exclude file globally
                          </button>
                        </div>
                      </div>
                      <div className="artifact-note sandbox-note">
                        <strong>Recommended global ignores</strong>
                        <span>Click any pattern to add or remove it from the global block list.</span>
                      </div>
                      <div className="sandbox-chip-bank">
                        {RECOMMENDED_GLOBAL_BLOCK_PATTERNS.map((pattern) => (
                          <button
                            key={pattern}
                            className={`sandbox-chip ${globalBlockedPatternSet.has(pattern) ? "sandbox-chip--active" : ""}`}
                            type="button"
                            onClick={() => toggleGlobalBlockedPattern(pattern)}
                          >
                            {pattern}
                          </button>
                        ))}
                      </div>
                      <BlockedPathList
                        blockedPaths={config.global_exclusions.blocked_paths ?? []}
                        onRemove={removeGlobalBlockedPath}
                        emptyCopy="No global path exclusions yet."
                      />
                      <label>
                        <span>Global blocked patterns</span>
                        <textarea
                          rows="5"
                          value={joinLines(config.global_exclusions.blocked_patterns)}
                          onChange={(event) => updateGlobalExclusionsField("blocked_patterns", splitLines(event.target.value))}
                          placeholder={".DS_Store\nThumbs.db\n.git/**\nnode_modules/**"}
                        />
                      </label>
                    </article>
                  </div>
                  <div className="artifact-note sandbox-note">
                    <strong>Where these rules apply</strong>
                    <span>Preview, build, refresh model, notes, and graph all honor the same sandbox boundary.</span>
                    <span>Every folder or disk you add in Setup is automatically treated as an allowed root.</span>
                    <span>Workspace exclusions only affect this workspace. Global exclusions follow every model you build in this app.</span>
                  </div>
                  <div className="sandbox-footer">
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={config.access.enforce_copy_mode}
                        onChange={(event) => updateAccessField("enforce_copy_mode", event.target.checked)}
                      />
                      <span>Force copy-only builds so the generated vault becomes the hard curated boundary.</span>
                    </label>
                    <div className="hero__actions hero__actions--tight">
                      <button className="secondary-button" type="button" onClick={handleSave} disabled={!!busy}>
                        {busy === "save" ? "Saving..." : "Save settings"}
                      </button>
                      <button className="ghost-button" type="button" onClick={exportConfig}>
                        Export JSON
                      </button>
                      <button className="ghost-button" type="button" onClick={handleExportBundle}>
                        Export bundle
                      </button>
                    </div>
                  </div>
                </section>
              </div>
            </section>
          </>
        ) : null}

        {isExploreLane && activeExploreView === "graph" ? (
          <>
            <CompactLaneHeader
              lane={activeExploreLane}
              actions={structureActions}
              summary={
                activeExploreLane === "digital-brain"
                  ? "Focus uses the current approved workspace to surface the first cognitive graph."
                  : "Preview checks scope. Build writes and activates the model. Refresh updates the active built model."
              }
            />
            {(activeExploreLane === "digital-brain" ? digitalBrainFocusGraph?.nodes?.length : activeResult?.graph?.nodes?.length) ? (
              <section className="panel panel--graph">
                <div className="panel__header panel__header--spread panel__header--compact">
                  <div>
                    <span className="eyebrow">{activeExploreLane === "digital-brain" ? "Focus" : "Graph"}</span>
                    <h3>{activeExploreLane === "digital-brain" ? "Cognitive focus of the current workspace" : "Visual structure of the current workspace"}</h3>
                  </div>
                  <div className="hero__actions hero__actions--tight">
                    {activeExploreLane === "digital-brain" ? (
                      <button className="ghost-button" type="button" onClick={handleSaveCurrentBrainView}>
                        Save cognitive view
                      </button>
                    ) : null}
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => openExploreTab(activeExploreLane, exploreTabIdForView(activeExploreLane, "notes"))}
                    >
                      {activeExploreLane === "digital-brain" ? "Open selected memory" : "Open selected notes"}
                    </button>
                  </div>
                </div>
                <Suspense
                  fallback={(
                    <div className="graph-empty">
                      <h3>Loading WebGL graph</h3>
                      <p>The 3D graph engine is loading for this workspace view.</p>
                    </div>
                  )}
                >
                  <GraphMap
                    graph={activeExploreLane === "digital-brain" ? digitalBrainFocusGraph : activeResult?.graph}
                    onSelectNode={selectGraphNode}
                    onAddNodeToCanvas={handleAddGraphNodeToCanvas}
                  />
                </Suspense>
                {activeExploreLane === "digital-brain" ? (
                  <div className="preview-stack">
                    {selectedFocusNode ? (
                      <section className="artifact-note">
                        <strong>{selectedFocusNode.label}</strong>
                        <span>{selectedFocusNode.summary || "No summary yet."}</span>
                        <span>Confidence: {selectedFocusNode.confidence != null ? selectedFocusNode.confidence.toFixed(2) : "n/a"}</span>
                        {(selectedFocusNode.why_surfaced || []).map((reason) => (
                          <span key={`${selectedFocusNode.id}-${reason}`}>{reason}</span>
                        ))}
                      </section>
                    ) : (
                      <section className="artifact-note">
                        <strong>Why this is shown</strong>
                        <span>Select a node in Focus to see the current surfacing reasons and confidence.</span>
                      </section>
                    )}
                    {digitalBrainViewRecommendations.length ? (
                      <section className="artifact-note">
                        <strong>Suggested cognitive views</strong>
                        <span>{digitalBrainViewRecommendations.map((item) => item.label).join(", ")}</span>
                      </section>
                    ) : null}
                  </div>
                ) : null}
              </section>
            ) : (
              <EmptyTabState
                title={activeExploreLane === "digital-brain" ? "No focus graph yet" : "No graph yet"}
                body={
                  activeExploreLane === "digital-brain"
                    ? "Preview the approved workspace first. The DB3 surface pass will build the first cognitive graph from shallow metadata."
                    : "Preview the workspace first. Once files are indexed, the graph will show the source and note relationships here."
                }
                actions={[
                  { label: "Run preview", onClick: () => startWorkspaceJob("preview"), primary: true },
                  guidedDemo ? { label: "Load guided demo", onClick: () => handleLoadExample(guidedDemo, true) } : null,
                ].filter(Boolean)}
              />
            )}
          </>
        ) : null}

        {isExploreLane && activeExploreView === "notes" ? (
          <>
            <LaneHeader lane={activeExploreLane} actions={structureActions} />
            {hasFiles ? (
              <>
                {activeExploreLane === "digital-brain" && digitalBrainMemoryCandidates.length ? (
                  <section className="panel">
                    <div className="panel__header">
                      <div>
                        <span className="eyebrow">Memory candidates</span>
                        <h3>First-pass memory shells from the current cognitive graph</h3>
                      </div>
                    </div>
                    <ul className="compact-list">
                      {digitalBrainMemoryCandidates.map((file) => (
                        <li key={file.id}>
                          <button className="quick-result" type="button" onClick={() => selectFile(file)}>
                            <strong>{file.label}</strong>
                            <span>{file.rel_path}</span>
                            <em>{file.summary || file.source_name || file.source}</em>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {activeExploreLane === "digital-brain" && digitalBrainWorkingSeeds.length ? (
                  <section className="panel">
                    <div className="panel__header">
                      <div>
                        <span className="eyebrow">Promoted cognitive records</span>
                        <h3>Canvas scopes promoted into memory, topic, and task records</h3>
                      </div>
                    </div>
                    <ul className="compact-list">
                      {digitalBrainWorkingSeeds.map((bookmark) => (
                        <li key={bookmark.id}>
                          <button className="quick-result" type="button" onClick={() => selectDigitalBrainRecord(bookmark)}>
                            <strong>{bookmark.title}</strong>
                            <span>{bookmark.kind} • {bookmark.selected_files?.length ?? 0} files</span>
                            <em>{bookmark.snapshot_bundle_label || "No snapshot linked yet"}</em>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {activeExploreLane === "digital-brain" && selectedBrainRecord && selectedBrainRecord.kind !== "decision" ? (
                  <section className="panel">
                    <div className="panel__header">
                      <div>
                        <span className="eyebrow">Cognitive record review</span>
                        <h3>{selectedBrainRecord.title}</h3>
                      </div>
                    </div>
                    <div className="field-grid">
                      <label className="field-grid__wide">
                        <span>Summary</span>
                        <textarea
                          rows="4"
                          value={selectedBrainRecord.summary || ""}
                          onChange={(event) => handleUpdateDigitalBrainRecord(selectedBrainRecord, { summary: event.target.value })}
                        />
                      </label>
                      <label>
                        <span>Review status</span>
                        <select
                          value={selectedBrainRecord.review_status || "new"}
                          onChange={(event) => handleUpdateDigitalBrainRecord(selectedBrainRecord, { review_status: event.target.value })}
                        >
                          <option value="new">New</option>
                          <option value="reviewed">Reviewed</option>
                          <option value="approved">Approved</option>
                        </select>
                      </label>
                      <label>
                        <span>Confidence</span>
                        <input
                          type="number"
                          min="0"
                          max="1"
                          step="0.01"
                          value={selectedBrainRecord.confidence ?? 0.72}
                          onChange={(event) => handleUpdateDigitalBrainRecord(selectedBrainRecord, { confidence: Number(event.target.value) || 0 })}
                        />
                      </label>
                      <label className="field-grid__wide">
                        <span>Provenance notes</span>
                        <textarea
                          rows="4"
                          value={selectedBrainRecord.provenance_notes || ""}
                          onChange={(event) => handleUpdateDigitalBrainRecord(selectedBrainRecord, { provenance_notes: event.target.value })}
                        />
                      </label>
                    </div>
                    <div className="artifact-note">
                      <strong>Source scope</strong>
                      <span>{selectedBrainRecord.source_scope_label || "Unknown scope"}</span>
                      <span>{selectedBrainRecord.selected_files?.length ?? 0} files</span>
                      <span>{selectedBrainRecord.snapshot_bundle_label || "No snapshot linked yet"}</span>
                      <span>{selectedBrainRecord.kind}</span>
                      {selectedBrainRecord.selected_files?.slice(0, 5).map((pathValue) => (
                        <span key={`${selectedBrainRecord.id}-${pathValue}`}>Evidence: {pathValue}</span>
                      ))}
                    </div>
                    <div className="hero__actions hero__actions--tight">
                      <button className="secondary-button" type="button" onClick={() => handleUpdateDigitalBrainRecord(selectedBrainRecord, { review_status: "approved" })}>
                        Approve record
                      </button>
                      <button className="ghost-button" type="button" onClick={() => handleDeleteDigitalBrainRecord(selectedBrainRecord)}>
                        Delete record
                      </button>
                    </div>
                  </section>
                ) : null}
                <section className="notes-grid">
                  <ExplorerPane
                    tree={tree}
                    selectedId={selectedFile?.id || ""}
                    expanded={expandedNodes}
                    onToggle={toggleNode}
                    onSelect={selectFile}
                    onOpenQuickSwitcher={() => setQuickOpen(true)}
                    filters={NOTES_FILTERS}
                    activeFilter={notesFilter}
                    onFilterChange={setNotesFilter}
                    onDragFileStart={(event, file) => {
                      event.dataTransfer.setData("application/context-vault-file", JSON.stringify(file));
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                    onSendToCanvas={handleSendFileToCanvas}
                  />
                  <PreviewPane
                    selectedFile={selectedFile}
                    preview={filePreview}
                    busy={filePreviewBusy}
                    onSelectLinkedFile={selectFile}
                    backlinks={backlinks}
                    outgoing={outgoingLinks}
                    onSaveFile={handleSaveFile}
                    onBookmarkFile={handleBookmarkFile}
                    onSendToCanvas={handleSendFileToCanvas}
                  />
                </section>
              </>
            ) : (
              <EmptyTabState
                title={activeExploreLane === "digital-brain" ? "No memory candidates are visible yet" : "No notes are visible yet"}
                body={
                  activeExploreLane === "digital-brain"
                    ? "Preview the approved workspace first. Once files are matched, Memory becomes the first-pass cognitive reading surface."
                    : "Preview the current workspace or load the guided demo first. Once files are matched, this tab becomes your reading and editing surface."
                }
                actions={[
                  { label: "Run preview", onClick: () => startWorkspaceJob("preview"), primary: true },
                  guidedDemo ? { label: "Load guided demo", onClick: () => handleLoadExample(guidedDemo, true) } : null,
                ].filter(Boolean)}
              />
            )}
          </>
        ) : null}

        {isExploreLane && activeExploreView === "canvas" ? (
          <>
            <LaneHeader lane={activeExploreLane} actions={structureActions} />
            <CanvasBoard
              canvases={canvases}
              templates={canvasTemplates}
              currentLane={activeExploreLane}
              selectedCanvasId={selectedCanvasId}
              onSelectCanvas={setSelectedCanvasId}
              onCreateCanvas={handleCreateCanvas}
              onCreateCanvasFromTemplate={handleCreateCanvasFromTemplate}
              onCreateCanvasFromSavedTemplate={handleCreateCanvasFromSavedTemplate}
              onImportCanvasBoard={handleImportCanvasBoard}
              onSaveCanvas={handleSaveCanvas}
              onSaveCanvasState={handleSaveCanvasState}
              onSaveCanvasAsTemplate={handleSaveCanvasAsTemplate}
              onUpdateCanvasTemplateFromCanvas={handleUpdateCanvasTemplateFromCanvas}
              onDeleteCanvasTemplate={handleDeleteCanvasTemplate}
              onDeleteCanvas={handleDeleteCanvas}
              onDuplicateCanvas={handleDuplicateCanvas}
              onExportCanvasBoard={handleExportCanvasBoard}
              onOpenFile={handleOpenCanvasFile}
              onRunLogicScope={handleRunLogicProfile}
              onExplainScope={handleCreateExplainBundle}
              onUseScopeInBuild={handleUseCanvasScopeInBuild}
              onCreatePatchPreviewScope={handleCreatePatchPreview}
              onSaveScope={handleSaveCanvasScope}
              onSaveScopeAsPreset={handleSaveCanvasScopeAsPreset}
              onPromoteScope={handlePromoteCanvasScope}
              selectedFile={selectedFile}
              files={files}
              recentFiles={recentFiles}
              bookmarkFiles={bookmarkFiles}
              canvasSnapshots={snapshots.filter((item) => item.kind === "canvas_state" && item.content?.canvas?.id === selectedCanvasId)}
              onRestoreCanvasSnapshot={handleRestoreSnapshot}
              historyTimeline={historyTimeline}
              buildPatchPreviews={buildPatchPreviews}
              buildApplyRuns={buildApplyRuns}
              linkedBrainRecords={digitalBrainRecords}
              onOpenDigitalBrainRecord={selectDigitalBrainRecord}
            />
          </>
        ) : null}

        {isExploreLane && activeExploreView === "history" ? (
          <>
            <LaneHeader lane={activeExploreLane} actions={structureActions} />
            <section className="vault-layout">
              <section className="panel">
                <div className="panel__header panel__header--spread">
                  <div>
                    <span className="eyebrow">Timeline</span>
                    <h3>How the scoped workspace changed over time</h3>
                  </div>
                  <button className="secondary-button" type="button" onClick={handleCreateDeltaSnapshot} disabled={!!busy}>
                    Create delta snapshot
                  </button>
                </div>
                {historyTimeline.length ? (
                  <ul className="compact-list">
                    {historyTimeline.slice(0, 12).map((item) => (
                      <li key={`${item.kind}-${item.id}`}>
                        <strong>{item.label}</strong>
                        <span>{item.kind}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-copy">No timeline artifacts yet.</p>
                )}
              </section>

              <section className="panel">
                <div className="panel__header panel__header--spread">
                  <div>
                    <span className="eyebrow">Comparison</span>
                    <h3>Compare the newest two snapshot bundles</h3>
                  </div>
                  <button className="secondary-button" type="button" onClick={handleCompareSnapshots} disabled={!!busy || !previousSnapshotBundle}>
                    Compare
                  </button>
                </div>
                {historyComparison ? (
                  <div className="artifact-note">
                    <strong>
                      {historyComparison.summary.changed_count} changed, {historyComparison.summary.added_count} added, {historyComparison.summary.removed_count} removed
                    </strong>
                    <span>Changed files: {historyComparison.changed_files.slice(0, 6).join(", ") || "None"}</span>
                  </div>
                ) : (
                  <p className="empty-copy">Use Compare to inspect the latest snapshot changes.</p>
                )}
                <div className="metrics-grid">
                  <MetricCard label="Snapshot bundles" value={snapshotBundles.length} hint="Saved structure states" />
                  <MetricCard label="Delta snapshots" value={deltaSnapshots.length} hint="Hash-based diffs" />
                </div>
              </section>
            </section>
          </>
        ) : null}

        {isExploreLane && activeExploreView === "decisions" ? (
          <>
            <LaneHeader lane={activeExploreLane} actions={structureActions} />
            <section className="vault-layout">
              <section className="panel">
                <div className="panel__header">
                  <div>
                    <span className="eyebrow">Decisions</span>
                    <h3>Early decision candidates from the current workspace</h3>
                  </div>
                </div>
                {decisionCandidates.length ? (
                  <ul className="compact-list">
                    {decisionCandidates.map((file) => (
                      <li key={file.id}>
                        <button className="quick-result" type="button" onClick={() => selectFile(file)}>
                          <strong>{file.label}</strong>
                          <span>{file.rel_path}</span>
                          <em>{file.summary || file.source_name || file.source}</em>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-copy">
                    No decision candidates are visible yet. This first phase uses simple document signals; deeper decision extraction comes in later phases.
                  </p>
                )}
              </section>
              {activeExploreLane === "digital-brain" && digitalBrainDecisionSeeds.length ? (
                <section className="panel">
                  <div className="panel__header">
                    <div>
                      <span className="eyebrow">Promoted decision seeds</span>
                      <h3>Canvas scopes promoted into Digital Brain decisions</h3>
                    </div>
                  </div>
                  <ul className="compact-list">
                    {digitalBrainDecisionSeeds.map((bookmark) => (
                      <li key={bookmark.id}>
                        <button className="quick-result" type="button" onClick={() => selectDigitalBrainRecord(bookmark)}>
                          <strong>{bookmark.title}</strong>
                          <span>{bookmark.selected_files?.length ?? 0} files</span>
                          <em>{bookmark.snapshot_bundle_label || "No snapshot linked yet"}</em>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {activeExploreLane === "digital-brain" && selectedBrainRecord?.kind === "decision" ? (
                <section className="panel">
                  <div className="panel__header">
                    <div>
                      <span className="eyebrow">Decision review</span>
                      <h3>{selectedBrainRecord.title}</h3>
                    </div>
                  </div>
                  <div className="field-grid">
                    <label className="field-grid__wide">
                      <span>Summary</span>
                      <textarea
                        rows="4"
                        value={selectedBrainRecord.summary || ""}
                        onChange={(event) => handleUpdateDigitalBrainRecord(selectedBrainRecord, { summary: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>Review status</span>
                      <select
                        value={selectedBrainRecord.review_status || "new"}
                        onChange={(event) => handleUpdateDigitalBrainRecord(selectedBrainRecord, { review_status: event.target.value })}
                      >
                        <option value="new">New</option>
                        <option value="reviewed">Reviewed</option>
                        <option value="approved">Approved</option>
                      </select>
                    </label>
                    <label>
                      <span>Confidence</span>
                      <input
                        type="number"
                        min="0"
                        max="1"
                        step="0.01"
                        value={selectedBrainRecord.confidence ?? 0.72}
                        onChange={(event) => handleUpdateDigitalBrainRecord(selectedBrainRecord, { confidence: Number(event.target.value) || 0 })}
                      />
                    </label>
                    <label className="field-grid__wide">
                      <span>Provenance notes</span>
                      <textarea
                        rows="4"
                        value={selectedBrainRecord.provenance_notes || ""}
                        onChange={(event) => handleUpdateDigitalBrainRecord(selectedBrainRecord, { provenance_notes: event.target.value })}
                      />
                    </label>
                  </div>
                  <div className="artifact-note">
                    <strong>Source scope</strong>
                    <span>{selectedBrainRecord.source_scope_label || "Unknown scope"}</span>
                    <span>{selectedBrainRecord.selected_files?.length ?? 0} files</span>
                    <span>{selectedBrainRecord.snapshot_bundle_label || "No snapshot linked yet"}</span>
                    {selectedBrainRecord.selected_files?.slice(0, 5).map((pathValue) => (
                      <span key={`${selectedBrainRecord.id}-${pathValue}`}>Evidence: {pathValue}</span>
                    ))}
                  </div>
                  <div className="hero__actions hero__actions--tight">
                    <button className="secondary-button" type="button" onClick={() => handleUpdateDigitalBrainRecord(selectedBrainRecord, { review_status: "approved" })}>
                      Approve decision
                    </button>
                    <button className="ghost-button" type="button" onClick={() => handleDeleteDigitalBrainRecord(selectedBrainRecord)}>
                      Delete decision
                    </button>
                  </div>
                </section>
              ) : null}
              <section className="panel">
                <div className="panel__header">
                  <div>
                    <span className="eyebrow">What this phase does</span>
                    <h3>Selective decision scaffolding</h3>
                  </div>
                </div>
                <div className="metrics-grid">
                  <MetricCard label="Candidates" value={decisionCandidates.length} hint="Heuristic decision-like files" />
                  <MetricCard label="Notes linked" value={hasFiles ? Math.min(files.length, 12) : 0} hint="Current cognitive scope" />
                </div>
                <p className="microcopy">
                  Digital Brain starts by surfacing likely decision artifacts from approved workspace files. Later phases will add evidence chains, decision provenance, and stronger extraction.
                </p>
              </section>
            </section>
          </>
        ) : null}

        {isExploreLane && activeExploreView === "saved" ? (
          <>
            <LaneHeader lane={activeExploreLane} actions={structureActions} />
            <section className="vault-layout">
              {activeExploreLane === "digital-brain" ? (
                <section className="panel">
                  <div className="panel__header panel__header--spread">
                    <div>
                      <span className="eyebrow">Saved cognitive views</span>
                      <h3>Reusable Focus views and record anchors</h3>
                    </div>
                    <button className="secondary-button" type="button" onClick={handleSaveCurrentBrainView}>
                      Save current view
                    </button>
                  </div>
                  {digitalBrainViewBookmarks.length ? (
                    <ul className="compact-list">
                      {digitalBrainViewBookmarks.map((bookmark) => (
                        <li key={bookmark.id}>
                          <strong>{bookmark.label}</strong>
                          <span>{bookmark.metadata?.node_count ?? 0} nodes</span>
                          <span>{bookmark.metadata?.focus_node_label || bookmark.metadata?.anchor_file_rel_path || "Saved focus"}</span>
                          <div className="hero__actions hero__actions--tight">
                            <button className="secondary-button" type="button" onClick={() => selectBookmark(bookmark)}>
                              Open view
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="empty-copy">No saved cognitive views yet.</p>
                  )}
                  {digitalBrainViewRecommendations.length ? (
                    <div className="artifact-note">
                      <strong>Suggested next views</strong>
                      <span>{digitalBrainViewRecommendations.map((item) => item.label).join(", ")}</span>
                    </div>
                  ) : null}
                </section>
              ) : null}
              <section className="panel">
                <div className="panel__header">
                  <div>
                    <span className="eyebrow">Saved graphs</span>
                    <h3>Snapshot bundles and build history</h3>
                  </div>
                </div>
                {snapshotBundles.length ? (
                  <ul className="compact-list">
                    {snapshotBundles.map((bundle) => (
                      <li key={bundle.id}>
                        <strong>{bundle.label}</strong>
                        <span>{bundle.file_count} files, {bundle.edge_count} edges</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-copy">No saved graph snapshots yet.</p>
                )}
              </section>
              <section className="panel">
                <div className="panel__header">
                  <div>
                    <span className="eyebrow">Saved scopes</span>
                    <h3>Reusable canvas scopes</h3>
                  </div>
                </div>
                {canvasScopeBookmarks.length ? (
                  <ul className="compact-list">
                    {canvasScopeBookmarks.map((bookmark) => (
                      <li key={bookmark.id}>
                        <strong>{bookmark.label}</strong>
                        <span>{bookmark.metadata?.selected_files?.length ?? 0} files</span>
                        {bookmark.metadata?.snapshot_label ? <span>{bookmark.metadata.snapshot_label}</span> : null}
                        <div className="hero__actions hero__actions--tight">
                          <button className="secondary-button" type="button" onClick={() => selectBookmark(bookmark)}>
                            Open scope
                          </button>
                          <button className="ghost-button" type="button" onClick={() => handleUseCanvasScopeInBuild(bookmark.metadata || {})}>
                            Use in Build
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-copy">No saved canvas scopes yet.</p>
                )}
              </section>
              <section className="panel">
                <div className="panel__header">
                  <div>
                    <span className="eyebrow">Scope comparison</span>
                    <h3>Compare two saved scopes</h3>
                  </div>
                </div>
                {canvasScopeBookmarks.length >= 2 ? (
                  <>
                    <div className="field-grid">
                      <label>
                        <span>Left scope</span>
                        <select value={scopeCompareLeftId} onChange={(event) => setScopeCompareLeftId(event.target.value)}>
                          <option value="">Choose scope</option>
                          {canvasScopeBookmarks.map((bookmark) => (
                            <option key={bookmark.id} value={bookmark.id}>
                              {bookmark.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Right scope</span>
                        <select value={scopeCompareRightId} onChange={(event) => setScopeCompareRightId(event.target.value)}>
                          <option value="">Choose scope</option>
                          {canvasScopeBookmarks.map((bookmark) => (
                            <option key={bookmark.id} value={bookmark.id}>
                              {bookmark.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {scopeComparison ? (
                      <div className="artifact-note">
                        <strong>
                          {scopeComparison.added.length} added, {scopeComparison.removed.length} removed, {scopeComparison.shared.length} shared
                        </strong>
                        <span>Added: {scopeComparison.added.slice(0, 8).join(", ") || "None"}</span>
                        <span>Removed: {scopeComparison.removed.slice(0, 8).join(", ") || "None"}</span>
                        <span>Shared: {scopeComparison.shared.slice(0, 8).join(", ") || "None"}</span>
                        <span>Added cards: {scopeComparison.addedCards.slice(0, 8).join(", ") || "None"}</span>
                        <span>Removed cards: {scopeComparison.removedCards.slice(0, 8).join(", ") || "None"}</span>
                        <span>Note-card delta: {scopeComparison.noteCardDelta}</span>
                        <span>Group-card delta: {scopeComparison.groupCardDelta}</span>
                        <span>Link delta: {scopeComparison.linkDelta}</span>
                        <span>Build goal changed: {scopeComparison.buildGoalChanged ? "Yes" : "No"}</span>
                      </div>
                    ) : (
                      <p className="empty-copy">Choose two saved scopes to compare their selected files.</p>
                    )}
                  </>
                ) : (
                  <p className="empty-copy">Save at least two canvas scopes to compare them here.</p>
                )}
              </section>
              <section className="panel">
                <div className="panel__header">
                  <div>
                    <span className="eyebrow">Build history</span>
                    <h3>Recent builds</h3>
                  </div>
                </div>
                {buildHistory.length ? (
                  <ul className="compact-list">
                    {buildHistory.map((entry) => (
                      <li key={entry.id}>
                        <strong>{entry.summary?.vault_name || "Vault model"}</strong>
                        <span>{entry.kind || "build"} • {entry.summary?.file_count || 0} files</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-copy">No build history yet.</p>
                )}
              </section>
            </section>
          </>
        ) : null}

        {isExploreLane && activeExploreView === "advanced" ? (
          <>
            <LaneHeader lane={activeExploreLane} actions={structureActions} />
            <section className="vault-layout">
              <div className="vault-layout__main">
                <PresetPanel
                  presets={presets}
                  buildHistory={buildHistory}
                  jobs={jobs}
                  onLoadPreset={loadPreset}
                  onSavePreset={handleSavePreset}
                  onDeletePreset={handleDeletePreset}
                />
              </div>
              <div className="vault-layout__side">
                <ArtifactStatusPanel
                  logicProfiles={logicProfiles}
                  explainBundles={explainBundles}
                  patchPreviews={buildPatchPreviews}
                  applyRuns={buildApplyRuns}
                  deltaSnapshots={deltaSnapshots}
                  parallelProfiles={parallelScanProfiles}
                  timeline={historyTimeline}
                  comparison={historyComparison}
                  onRunLogicProfile={handleRunLogicProfile}
                  onCreateExplainBundle={handleCreateExplainBundle}
                  onCreatePatchPreview={handleCreatePatchPreview}
                  onApplyPatchPreview={handleApplyPatchPreview}
                  onCreateDeltaSnapshot={handleCreateDeltaSnapshot}
                  onRunParallelProfile={handleRunParallelProfile}
                  onCompareSnapshots={handleCompareSnapshots}
                  busy={busy}
                />
              </div>
            </section>
          </>
        ) : null}

        {mainTab === "logic" ? (
          <>
            <LaneHeader lane="logic" actions={logicActions} />
            {logicTab === "overview" ? (
              <section className="vault-layout">
                <section className="panel">
                  <div className="panel__header">
                    <div>
                      <span className="eyebrow">Overview</span>
                      <h3>Current code-mapping state</h3>
                    </div>
                  </div>
                  <div className="field-grid">
                    <label>
                      <span>Worker mode</span>
                      <select value={logicWorkerProfile} onChange={(event) => setLogicWorkerProfile(event.target.value)}>
                        <option value="default">Default ({DEFAULT_WORKER_COUNT} workers)</option>
                        <option value="aggressive">Aggressive ({workerCountForProfile("aggressive")} workers)</option>
                      </select>
                    </label>
                  </div>
                  <div className="metrics-grid">
                    <MetricCard label="Profiles" value={logicProfiles.length} hint="Stored logic runs" />
                    <MetricCard label="Imports" value={latestLogicProfile?.import_count ?? 0} hint="Detected imports" />
                    <MetricCard label="Symbols" value={latestLogicProfile?.symbol_count ?? 0} hint="Detected symbols" />
                    <MetricCard label="Routes" value={latestLogicProfile?.route_count ?? 0} hint="Route hints" />
                  </div>
                  <p className="microcopy">
                    Logic is the first-pass code mapper. It turns the current scoped workspace into import, symbol, route, and storage-touch signals.
                  </p>
                </section>
                <section className="panel">
                  <div className="panel__header">
                    <div>
                      <span className="eyebrow">Parallel profile</span>
                      <h3>Scan performance</h3>
                    </div>
                  </div>
                  {latestParallelProfile ? (
                    <div className="metrics-grid">
                      <MetricCard label="Files" value={latestParallelProfile.file_count} hint="Profiled files" />
                      <MetricCard label="Workers" value={latestParallelProfile.worker_count} hint="Parallel workers" />
                    </div>
                  ) : (
                    <p className="empty-copy">Run Parallel scan to measure the current scoped sources.</p>
                  )}
                </section>
              </section>
            ) : null}
            {logicTab === "signals" ? (
              <section className="vault-layout">
                <section className="panel">
                  <div className="panel__header">
                    <div>
                      <span className="eyebrow">Signals</span>
                      <h3>Latest logic counts</h3>
                    </div>
                  </div>
                  <div className="metrics-grid">
                    <MetricCard label="Files" value={latestLogicProfile?.file_count ?? 0} hint="Scoped code files" />
                    <MetricCard label="Imports" value={latestLogicProfile?.import_count ?? 0} hint="Import statements" />
                    <MetricCard label="Symbols" value={latestLogicProfile?.symbol_count ?? 0} hint="Named functions/classes" />
                    <MetricCard label="Storage" value={latestLogicProfile?.storage_touch_count ?? 0} hint="Storage touch hints" />
                  </div>
                </section>
                <section className="panel">
                  <div className="panel__header">
                    <div>
                      <span className="eyebrow">Artifacts</span>
                      <h3>Supporting engine outputs</h3>
                    </div>
                  </div>
                  <ul className="compact-list">
                    <li>
                      <strong>Snapshot bundles</strong>
                      <span>{snapshotBundles.length} available</span>
                    </li>
                    <li>
                      <strong>Delta snapshots</strong>
                      <span>{deltaSnapshots.length} available</span>
                    </li>
                    <li>
                      <strong>Timeline entries</strong>
                      <span>{historyTimeline.length} available</span>
                    </li>
                  </ul>
                </section>
              </section>
            ) : null}
            {logicTab === "files" ? (
              <section className="panel">
                <div className="panel__header">
                  <div>
                    <span className="eyebrow">Scoped files</span>
                    <h3>Files available to the current logic run</h3>
                  </div>
                </div>
                {activeResult?.files?.length ? (
                  <ul className="compact-list">
                    {activeResult.files.slice(0, 40).map((file) => (
                      <li key={file.id}>
                        <strong>{file.rel_path}</strong>
                        <span>{file.source_name}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-copy">Preview the current scope first.</p>
                )}
              </section>
            ) : null}
          </>
        ) : null}

        {mainTab === "explain" ? (
          <>
            <LaneHeader lane="explain" actions={explainActions} />
            {explainTab === "overview" ? (
              <section className="vault-layout">
                <section className="panel">
                  <div className="panel__header">
                    <div>
                      <span className="eyebrow">Overview</span>
                      <h3>Explain what the current scope means</h3>
                    </div>
                  </div>
                  <div className="metrics-grid">
                    <MetricCard label="Bundles" value={explainBundles.length} hint="Saved explain runs" />
                    <MetricCard label="Top files" value={latestExplainBundle?.top_file_count ?? 0} hint="Files carried into explain context" />
                    <MetricCard label="Top symbols" value={latestExplainBundle?.top_symbol_count ?? 0} hint="Logic-backed symbol summaries" />
                    <MetricCard label="Logic profiles" value={logicProfiles.length} hint="Source for explain context" />
                  </div>
                </section>
                <section className="panel">
                  <div className="panel__header">
                    <div>
                      <span className="eyebrow">Bridge</span>
                      <h3>Explain to Build handoff</h3>
                    </div>
                  </div>
                  <p className="microcopy">
                    Explain bundles package architecture summary, top files, top symbols, and feature clusters so Build can plan against a smaller, more intelligible context packet.
                  </p>
                </section>
              </section>
            ) : null}
            {explainTab === "bundle" ? (
              <section className="vault-layout">
                <section className="panel">
                  <div className="panel__header">
                    <div>
                      <span className="eyebrow">Bundle</span>
                      <h3>Latest explain bundle</h3>
                    </div>
                  </div>
                  {latestExplainBundle ? (
                    <ul className="compact-list">
                      <li>
                        <strong>{latestExplainBundle.label}</strong>
                        <span>{latestExplainBundle.top_file_count} top files</span>
                      </li>
                      <li>
                        <strong>Snapshot source</strong>
                        <span>{latestExplainBundle.snapshot_bundle_id}</span>
                      </li>
                      <li>
                        <strong>Logic source</strong>
                        <span>{latestExplainBundle.logic_profile_id || "none"}</span>
                      </li>
                    </ul>
                  ) : (
                    <p className="empty-copy">Create an explain bundle from the latest snapshot.</p>
                  )}
                </section>
                <section className="panel">
                  <div className="panel__header">
                    <div>
                      <span className="eyebrow">Architecture context</span>
                      <h3>Current handoff sources</h3>
                    </div>
                  </div>
                  <ul className="compact-list">
                    <li>
                      <strong>Snapshot bundles</strong>
                      <span>{snapshotBundles.length} available</span>
                    </li>
                    <li>
                      <strong>Logic profiles</strong>
                      <span>{logicProfiles.length} available</span>
                    </li>
                  </ul>
                </section>
              </section>
            ) : null}
            {explainTab === "history" ? (
              <section className="panel">
                <div className="panel__header">
                  <div>
                    <span className="eyebrow">History</span>
                    <h3>Explain bundle timeline</h3>
                  </div>
                </div>
                {explainBundles.length ? (
                  <ul className="compact-list">
                    {explainBundles.map((bundle) => (
                      <li key={bundle.id}>
                        <strong>{bundle.label}</strong>
                        <span>{bundle.top_file_count} files, {bundle.top_symbol_count} symbols</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-copy">No explain bundles yet.</p>
                )}
              </section>
            ) : null}
          </>
        ) : null}

        {mainTab === "build" ? (
          <>
            <LaneHeader lane="build" actions={buildActions} />
            {buildTab === "goal" ? (
              <section className="vault-layout">
                <section className="panel">
                  <div className="panel__header">
                    <div>
                      <span className="eyebrow">Goal</span>
                      <h3>Describe the deterministic build plan</h3>
                    </div>
                  </div>
                  <div className="field-grid">
                    <label className="field-grid__wide">
                      <span>Build goal</span>
                      <textarea rows="4" value={buildGoalDraft} onChange={(event) => setBuildGoalDraft(event.target.value)} />
                    </label>
                    <label className="field-grid__wide">
                      <span>SLCS pieces</span>
                      <input value={buildPiecesDraft} onChange={(event) => setBuildPiecesDraft(event.target.value)} placeholder="docs_cleanup_piece, summary_validator_piece" />
                    </label>
                  </div>
                  <div className="hero__actions hero__actions--tight">
                    <button className="primary-button" type="button" onClick={handleCreatePatchPreview} disabled={!!busy}>
                      Create patch preview
                    </button>
                  </div>
                  {activeBuildScopeChecks.length ? (
                    <div className="artifact-note">
                      <strong>Canvas review checks</strong>
                      {activeBuildScopeChecks.map((item) => (
                        <span key={item.id}>{item.pass ? "Ready" : "Missing"}: {item.label}</span>
                      ))}
                    </div>
                  ) : null}
                </section>
                <section className="panel">
                  <div className="panel__header">
                    <div>
                      <span className="eyebrow">Canvas-derived scope</span>
                      <h3>Choose the board scope Build should use</h3>
                    </div>
                  </div>
                  {activeBuildScope ? (
                    <div className="artifact-note">
                      <strong>{activeBuildScope.label}</strong>
                      <span>{activeBuildScope.selected_files?.length ?? 0} files</span>
                      <span>{activeBuildScope.description || "Active canvas-derived scope"}</span>
                      {activeBuildScope.build_goal ? <span>Board goal: {activeBuildScope.build_goal}</span> : null}
                      {activeBuildScope.allowed_targets?.length ? <span>Allowed targets: {activeBuildScope.allowed_targets.join(", ")}</span> : null}
                      {activeBuildScope.forbidden_paths?.length ? <span>Forbidden paths: {activeBuildScope.forbidden_paths.join(", ")}</span> : null}
                    </div>
                  ) : (
                    <p className="empty-copy">No active canvas scope yet. Use Canvas, Saved scopes, or the buttons below.</p>
                  )}
                  <div className="hero__actions hero__actions--tight">
                    <button className="ghost-button" type="button" onClick={() => setActiveBuildScope(null)}>
                      Clear active scope
                    </button>
                    {activeBuildScope ? (
                      <button className="ghost-button" type="button" onClick={() => handleSaveCanvasScopeAsPreset(activeBuildScope)}>
                        Save active scope as preset
                      </button>
                    ) : null}
                  </div>
                  {canvasScopeBookmarks.length ? (
                    <ul className="compact-list">
                      {canvasScopeBookmarks.slice(0, 8).map((bookmark) => (
                        <li key={bookmark.id}>
                          <strong>{bookmark.label}</strong>
                          <span>{bookmark.metadata?.selected_files?.length ?? 0} files</span>
                          <div className="hero__actions hero__actions--tight">
                            <button className="secondary-button" type="button" onClick={() => handleUseCanvasScopeInBuild(bookmark.metadata || {})}>
                              Use this scope
                            </button>
                            <button className="ghost-button" type="button" onClick={() => selectBookmark(bookmark)}>
                              Open in Canvas
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
                <section className="panel">
                  <div className="panel__header">
                    <div>
                      <span className="eyebrow">Inputs</span>
                      <h3>Current Build context</h3>
                    </div>
                  </div>
                  <div className="metrics-grid">
                    <MetricCard label="Snapshot" value={latestSnapshotBundle ? 1 : 0} hint={latestSnapshotBundle?.label || "No snapshot yet"} />
                    <MetricCard label="Logic" value={logicProfiles.length} hint={latestLogicProfile?.label || "No logic profile yet"} />
                    <MetricCard label="Explain" value={explainBundles.length} hint={latestExplainBundle?.label || "No explain bundle yet"} />
                    <MetricCard label="Build pieces" value={buildPiecesDraft.split(",").map((item) => item.trim()).filter(Boolean).length} hint="Selected pieces" />
                  </div>
                  {activeBuildScope ? (
                    <div className="artifact-note">
                      <strong>Active canvas scope</strong>
                      <span>
                        {activeBuildScope.label} with {activeBuildScope.selected_files.length} selected file
                        {activeBuildScope.selected_files.length === 1 ? "" : "s"}.
                      </span>
                      <span>{activeBuildScope.description}</span>
                      {activeBuildScope.build_goal ? <span>Board goal: {activeBuildScope.build_goal}</span> : null}
                      {activeBuildScope.review_notes ? <span>Review notes: {activeBuildScope.review_notes}</span> : null}
                      <div className="hero__actions hero__actions--tight">
                        <button className="ghost-button" type="button" onClick={() => setActiveBuildScope(null)}>
                          Clear build scope
                        </button>
                      </div>
                    </div>
                  ) : null}
                </section>
              </section>
            ) : null}
            {buildTab === "preview" ? (
              <section className="vault-layout">
                <section className="panel">
                  <div className="panel__header">
                    <div>
                      <span className="eyebrow">Patch preview</span>
                      <h3>Latest gated Build preview</h3>
                    </div>
                  </div>
                  {latestPatchPreview ? (
                    <ul className="compact-list">
                      <li>
                        <strong>{latestPatchPreview.label}</strong>
                        <span>{latestPatchPreview.copied_file_count} scoped inputs</span>
                      </li>
                      {latestPatchPreview.canvas_label ? (
                        <li>
                          <strong>Canvas</strong>
                          <span>{latestPatchPreview.canvas_label}</span>
                        </li>
                      ) : null}
                      {latestPatchPreview.scope_label ? (
                        <li>
                          <strong>Scope</strong>
                          <span>{latestPatchPreview.scope_label}</span>
                        </li>
                      ) : null}
                      <li>
                        <strong>Warnings</strong>
                        <span>{latestPatchPreview.warning_count}</span>
                      </li>
                      <li>
                        <strong>Errors</strong>
                        <span>{latestPatchPreview.error_count}</span>
                      </li>
                    </ul>
                  ) : (
                    <p className="empty-copy">No patch preview yet.</p>
                  )}
                </section>
                <section className="panel">
                  <div className="panel__header">
                    <div>
                      <span className="eyebrow">Guardrails</span>
                      <h3>Why this is safer</h3>
                    </div>
                  </div>
                  <ul className="sidebar-list">
                    <li>Only scoped files are copied into the patch preview.</li>
                    <li>Allowed targets and forbidden paths are checked first.</li>
                    <li>No changes go straight into the main repo.</li>
                  </ul>
                </section>
              </section>
            ) : null}
            {buildTab === "apply" ? (
              <section className="vault-layout">
                <section className="panel">
                  <div className="panel__header panel__header--spread">
                    <div>
                      <span className="eyebrow">Apply</span>
                      <h3>Scratch apply and reconciliation</h3>
                    </div>
                    <button className="primary-button" type="button" onClick={handleApplyPatchPreview} disabled={!!busy || !latestPatchPreview}>
                      Apply latest preview
                    </button>
                  </div>
                  {latestApplyRun ? (
                    <ul className="compact-list">
                      <li>
                        <strong>{latestApplyRun.label}</strong>
                        <span>{latestApplyRun.preview_id}</span>
                      </li>
                      <li>
                        <strong>Scratch apply dir</strong>
                        <span>{latestApplyRun.scratch_apply_dir}</span>
                      </li>
                      <li>
                        <strong>Rollback dir</strong>
                        <span>{latestApplyRun.rollback_dir}</span>
                      </li>
                    </ul>
                  ) : (
                    <p className="empty-copy">No scratch apply run yet.</p>
                  )}
                </section>
                <section className="panel">
                  <div className="panel__header">
                    <div>
                      <span className="eyebrow">Reconciliation</span>
                      <h3>After-apply signals</h3>
                    </div>
                  </div>
                  <div className="metrics-grid">
                    <MetricCard label="Apply runs" value={buildApplyRuns.length} hint="Scratch apply history" />
                    <MetricCard label="Delta snapshots" value={deltaSnapshots.length} hint="Compare before and after" />
                  </div>
                </section>
              </section>
            ) : null}
            {buildTab === "history" ? (
              <section className="panel">
                <div className="panel__header">
                  <div>
                    <span className="eyebrow">Build history</span>
                    <h3>Patch previews and apply runs</h3>
                  </div>
                </div>
                <ul className="compact-list">
                  {buildPatchPreviews.map((preview) => (
                    <li key={preview.id}>
                      <strong>{preview.label}</strong>
                      <span>{preview.warning_count} warnings / {preview.error_count} errors</span>
                    </li>
                  ))}
                  {buildApplyRuns.map((run) => (
                    <li key={run.id}>
                      <strong>{run.label}</strong>
                      <span>{run.preview_id}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  );
}
