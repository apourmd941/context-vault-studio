import { Suspense, lazy, startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";

import BookmarkPanel from "./BookmarkPanel";
import CanvasBoard from "./CanvasBoard";
import ExplorerPane from "./ExplorerPane";
import {
  applyPatchPreview,
  compareHistorySnapshots,
  createBookmark,
  createCanvas,
  createFile,
  createJob,
  createDeltaSnapshot,
  createExplainBundle,
  chooseNativePath,
  createLogicProfile,
  createParallelScanProfile,
  createPatchPreview,
  createPreset,
  deletePreset,
  exportBundle,
  fetchBootstrap,
  fetchBuildHistory,
  fetchFilePreview,
  fetchHistoryTimeline,
  fetchJob,
  inspectPath,
  restoreSnapshot,
  saveFile,
  saveLayout,
  saveWorkspaceConfig,
  updateCanvas,
} from "./api";
import PresetPanel from "./PresetPanel";
import PreviewPane from "./PreviewPane";
import QuickSwitcher from "./QuickSwitcher";
import SnapshotPanel from "./SnapshotPanel";
import { buildAdjacency, buildFileTree, searchFiles } from "./lib/vault";


const GraphMap = lazy(() => import("./GraphMap"));


const EMPTY_ACCESS = {
  allowed_roots: [],
  blocked_paths: [],
  blocked_patterns: [],
  enforce_copy_mode: true,
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

const MAIN_TABS = [
  { id: "structure", label: "Structure" },
  { id: "logic", label: "Logic" },
  { id: "explain", label: "Explain" },
  { id: "build", label: "Build" },
];

const SUB_TABS = {
  structure: [
    { id: "setup", label: "Setup" },
    { id: "graph", label: "Graph" },
    { id: "notes", label: "Notes" },
    { id: "canvas", label: "Canvas" },
    { id: "history", label: "History" },
    { id: "saved", label: "Saved Graphs" },
    { id: "advanced", label: "Advanced" },
  ],
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
};

const LANE_COPY = {
  structure: {
    eyebrow: "Structure mapper",
    title: "Map the files and folders you want the app to understand.",
    description:
      "Use Structure to choose allowed folders or disks, preview the graph, inspect notes, and review how the scoped workspace changes over time.",
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
  };
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


function BlockedPathList({ blockedPaths, onRemove }) {
  if (!blockedPaths.length) {
    return <p className="empty-copy">No excluded folders or files yet.</p>;
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
  const [historyTimeline, setHistoryTimeline] = useState([]);
  const [historyComparison, setHistoryComparison] = useState(null);
  const [buildGoalDraft, setBuildGoalDraft] = useState("Generate a deterministic scoped improvement plan");
  const [buildPiecesDraft, setBuildPiecesDraft] = useState("docs_cleanup_piece");
  const [canvases, setCanvases] = useState([]);
  const [selectedCanvasId, setSelectedCanvasId] = useState("");
  const [jobs, setJobs] = useState([]);
  const [activeJobId, setActiveJobId] = useState("");
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

  const deferredSources = useDeferredValue(config.sources);
  const activeResult = buildResult ?? preview;
  const files = activeResult?.files ?? [];
  const tree = useMemo(() => buildFileTree(files), [files]);
  const searchResults = useMemo(() => searchFiles(files, quickQuery, 24), [files, quickQuery]);
  const adjacency = useMemo(() => buildAdjacency(activeResult?.graph ?? { nodes: [], edges: [] }), [activeResult]);
  const fileLookup = useMemo(() => new Map(files.map((file) => [file.id, file])), [files]);
  const guidedDemo = examples.find((example) => example.id === "guided-demo") || examples[0] || null;
  const latestJob = jobs[0] || null;
  const hasSources = deferredSources.length > 0;
  const hasFiles = files.length > 0;
  const recentFiles = files.slice(0, 6);
  const blockedRuleCount =
    (config.access?.blocked_paths?.length ?? 0) + (config.access?.blocked_patterns?.length ?? 0);

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
      setHistoryTimeline(timeline ?? []);
    });
    return bootstrapPayload;
  }

  function openStructureTab(tab) {
    setMainTab("structure");
    setStructureTab(tab);
    if (tab === "notes") {
      setActiveTab("notes");
    } else if (tab === "canvas") {
      setActiveTab("canvas");
    } else if (tab === "graph") {
      setActiveTab("graph");
    } else {
      setActiveTab("vault");
    }
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
          setCanvases(payload.canvases ?? []);
          setSelectedCanvasId((payload.canvases ?? [])[0]?.id || "");
          setJobs(payload.jobs ?? []);
          setConfig(normalizeConfig(payload.config));
          setLayout(payload.layout ?? layout);
          setBuildResult(normalizeResult(payload.last_result));
          setPreview(normalizeResult(payload.last_result));
          setMainTab("structure");
          setStructureTab("setup");
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
    if (!files.length) {
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
    const preferred = files.find((file) => file.original_path === layout.selected_file_path);
    setSelectedFile(preferred || files[0]);
  }, [fileLookup, files, layout.selected_file_path, selectedFile, tree]);

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
            setNotice(
              result.summary?.file_count
                ? `Preview ready. ${result.summary.file_count} files are now visible in the workspace.`
                : "Preview finished, but nothing matched yet. Adjust sources or patterns.",
            );
            openStructureTab(result.summary?.file_count ? "graph" : "setup");
          } else {
            setBuildResult(result);
            setPreview(result);
            if (result.snapshot_bundle) {
              setSnapshotBundles((current) => [
                result.snapshot_bundle,
                ...current.filter((item) => item.id !== result.snapshot_bundle.id),
              ].slice(0, 20));
            }
            setBuildHistory(await fetchBuildHistory());
            setNotice(
              `Vault built with ${result.summary?.file_count ?? 0} files at ${
                result.artifacts?.vault_dir || result.artifacts?.output_dir
              }.`,
            );
            openStructureTab(result.summary?.file_count ? "notes" : "setup");
          }
          setBusy("");
          setActiveJobId("");
        } else if (job.status === "failed") {
          setError(job.error || "Job failed");
          setBusy("");
          setActiveJobId("");
          openStructureTab("setup");
        }
      } catch (pollError) {
        setError(pollError.message);
        setBusy("");
        setActiveJobId("");
      }
    }, 900);

    return () => window.clearInterval(interval);
  }, [activeJobId]);

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
      openStructureTab("setup");
      return;
    }

    setBusy(kind);
    setError("");
    setNotice("");
    try {
      const job = await createJob(kind, payload, true);
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
    openStructureTab("setup");
    if (autoPreview && nextConfig.sources.length) {
      await startWorkspaceJob("preview", nextConfig);
    } else {
      setNotice(`${example.label} loaded.`);
    }
  }

  function loadPreset(preset) {
    patchConfig(normalizeConfig(preset.config));
    setNotice(`${preset.name} loaded.`);
    openStructureTab("setup");
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

  async function handleRunLogicProfile() {
    const validationError = validateWorkspaceRun(serializeConfig(config));
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy("logic-profile");
    setError("");
    setNotice("");
    try {
      const payload = await createLogicProfile(serializeConfig(config), 4);
      await refreshV2Artifacts();
      setNotice(`Logic profile ready for ${payload.profile.summary.file_count} files.`);
    } catch (logicError) {
      setError(logicError.message);
    } finally {
      setBusy("");
    }
  }

  async function handleCreateExplainBundle() {
    const snapshotBundle = snapshotBundles[0] || activeResult?.snapshot_bundle;
    if (!snapshotBundle?.id) {
      setError("Run preview or build first so there is a snapshot bundle to explain.");
      return;
    }
    setBusy("explain-bundle");
    setError("");
    setNotice("");
    try {
      const payload = await createExplainBundle(snapshotBundle.id, logicProfiles[0]?.id || null);
      await refreshV2Artifacts();
      setNotice(`Explain bundle created with ${payload.bundle.summary.top_file_count} top files.`);
    } catch (explainError) {
      setError(explainError.message);
    } finally {
      setBusy("");
    }
  }

  async function handleCreatePatchPreview() {
    const snapshotBundle = snapshotBundles[0] || activeResult?.snapshot_bundle;
    if (!snapshotBundle?.id) {
      setError("Run preview or build first so there is a snapshot bundle to use.");
      return;
    }
    const goal = buildGoalDraft.trim() || window.prompt("Build goal", "Generate a deterministic scoped improvement plan");
    if (!goal) {
      return;
    }
    const piecesValue = buildPiecesDraft.trim() || window.prompt("SLCS pieces (comma separated)", "docs_cleanup_piece");
    const selectedPieces = (piecesValue || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const selectedFiles = selectedFile?.rel_path ? [selectedFile.rel_path] : (activeResult?.files ?? []).slice(0, 3).map((file) => file.rel_path);

    setBusy("patch-preview");
    setError("");
    setNotice("");
    try {
      const payload = await createPatchPreview({
        goal,
        snapshot_bundle_id: snapshotBundle.id,
        explain_bundle_id: explainBundles[0]?.id || null,
        adapter_id: "deterministic",
        selected_slcs_pieces: selectedPieces,
        selected_files: selectedFiles,
        allowed_targets: config.sources.map((source) => source.path).filter(Boolean),
        forbidden_paths: config.access.blocked_paths ?? [],
      });
      await refreshV2Artifacts();
      setNotice(`Patch preview created with ${payload.copied_file_count} scoped input files.`);
    } catch (patchError) {
      setError(patchError.message);
    } finally {
      setBusy("");
    }
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
      const payload = await createParallelScanProfile(serializeConfig(config), 4);
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
      openStructureTab("setup");
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
      });
      setCanvases((current) => [...current, canvas]);
      setSelectedCanvasId(canvas.id);
      openStructureTab("canvas");
    } catch (canvasError) {
      setError(canvasError.message);
    }
  }

  async function handleSaveCanvas(canvas, cards) {
    if (!canvas) {
      return;
    }
    try {
      const saved = await updateCanvas(canvas.id, {
        name: canvas.name,
        description: canvas.description || "",
        cards,
        edges: canvas.edges || [],
      });
      setCanvases((current) => current.map((item) => (item.id === saved.id ? saved : item)));
      setNotice(`Saved canvas ${saved.name}.`);
    } catch (canvasError) {
      setError(canvasError.message);
    }
  }

  async function handleAddFileCard(canvas, file) {
    if (!canvas || !file) {
      return;
    }
    const cards = [
      ...(canvas.cards || []),
      {
        id: crypto.randomUUID(),
        type: "file",
        label: file.label,
        path: file.original_path,
        file_id: file.id,
        x: 32 + (canvas.cards || []).length * 22,
        y: 32 + (canvas.cards || []).length * 18,
        width: 300,
        height: 180,
        color: "violet",
      },
    ];
    await handleSaveCanvas(canvas, cards);
  }

  async function handleAddTextCard(canvas) {
    if (!canvas) {
      return;
    }
    const text = window.prompt("Card text", "New idea");
    if (!text) {
      return;
    }
    const cards = [
      ...(canvas.cards || []),
      {
        id: crypto.randomUUID(),
        type: "text",
        label: text.split("\n")[0].slice(0, 48),
        text,
        x: 40 + (canvas.cards || []).length * 18,
        y: 40 + (canvas.cards || []).length * 18,
        width: 280,
        height: 180,
        color: "mint",
      },
    ];
    await handleSaveCanvas(canvas, cards);
  }

  function selectFile(file) {
    setSelectedFile(file);
    setQuickOpen(false);
    openStructureTab("notes");
  }

  function selectBookmark(bookmark) {
    if (bookmark.type === "file") {
      const match = files.find((file) => file.original_path === bookmark.path || file.id === bookmark.file_id);
      if (match) {
        selectFile(match);
      }
    }
  }

  const latestSnapshotBundle = snapshotBundles[0] || activeResult?.snapshot_bundle || null;
  const previousSnapshotBundle = snapshotBundles[1] || null;
  const latestLogicProfile = logicProfiles[0] || null;
  const latestExplainBundle = explainBundles[0] || null;
  const latestPatchPreview = buildPatchPreviews[0] || null;
  const latestApplyRun = buildApplyRuns[0] || null;
  const latestParallelProfile = parallelScanProfiles[0] || null;
  const latestDeltaSnapshot = deltaSnapshots[0] || null;
  const activeSubTab =
    mainTab === "structure"
      ? structureTab
      : mainTab === "logic"
        ? logicTab
        : mainTab === "explain"
          ? explainTab
          : buildTab;

  function handleMainTabChange(tabId) {
    setMainTab(tabId);
  }

  function handleSubTabChange(tabId) {
    if (mainTab === "structure") {
      openStructureTab(tabId);
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
        Parallel scan
      </button>
      <button className="primary-button" type="button" onClick={handleRunLogicProfile} disabled={!!busy}>
        Run logic
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
            <span className="eyebrow">Structure / Logic / Explain / Build</span>
            <h1>Context Vault Studio</h1>
          </div>
        </div>

        {mainTab === "structure" ? (
          <>
            {structureTab === "setup" ? (
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
            ) : null}
            {structureTab === "notes" ? (
              <>
                <div className="sidebar__panel">
                  <span className="eyebrow">Notes</span>
                  <p className="sidebar-copy">
                    Browse matched files, follow links, and edit the scoped notes that made it into the current workspace.
                  </p>
                </div>
                <BookmarkPanel bookmarks={bookmarks} onSelectBookmark={selectBookmark} />
                <SnapshotPanel snapshots={snapshots} onRestore={handleRestoreSnapshot} />
              </>
            ) : null}
            {structureTab === "canvas" ? (
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
            {structureTab === "graph" ? (
              <>
                <div className="sidebar__panel">
                  <span className="eyebrow">Graph tips</span>
                  <ul className="sidebar-list">
                    <li>Preview or build first so the graph has real nodes.</li>
                    <li>Use the graph to choose what to open next.</li>
                    <li>Click a node to jump directly into notes.</li>
                  </ul>
                </div>
                <div className="sidebar__panel">
                  <span className="eyebrow">Current map</span>
                  <div className="sidebar-card-stack">
                    <div className="sidebar-card sidebar-card--static">
                      <strong>{activeResult?.summary?.file_count ?? 0} files</strong>
                      <span>{activeResult?.summary?.edge_count ?? 0} edges</span>
                      <em>{activeResult ? "Ready to explore" : "No result yet"}</em>
                    </div>
                  </div>
                </div>
              </>
            ) : null}
            {structureTab === "history" || structureTab === "saved" || structureTab === "advanced" ? (
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
          <div className="callout">
            {(jobs.find((job) => job.id === activeJobId)?.message || "Working")}{" "}
            {jobs.find((job) => job.id === activeJobId)?.progress ?? 0}%
          </div>
        ) : null}
        {!activeJobId && latestJob?.status === "failed" ? (
          <div className="callout callout--error">Last job failed: {latestJob.error || latestJob.message}</div>
        ) : null}

        {mainTab === "structure" && structureTab === "setup" ? (
          <>
            <LaneHeader lane="structure" actions={structureActions} />
            <section className="structure-setup-grid">
              <div className="structure-setup-main">
                {activeResult ? (
                  <ResultSpotlight
                    result={activeResult}
                    outputDir={buildResult?.artifacts?.vault_dir}
                    snapshotBundle={activeResult?.snapshot_bundle || snapshotBundles[0]}
                    onOpenNotes={() => openStructureTab("notes")}
                    onOpenGraph={() => openStructureTab("graph")}
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
                      Load the guided demo from Templates or add a folder or disk, then use the top-right `Preview` button to populate Structure.
                    </p>
                  </section>
                )}
                <section className="panel">
                  <div className="panel__header panel__header--spread">
                    <div>
                      <span className="eyebrow">Setup</span>
                      <h3>Choose the folders Structure is allowed to map</h3>
                    </div>
                    <div className="hero__actions hero__actions--tight">
                      <button className="primary-button" type="button" onClick={handleAddFolderByBrowse}>
                        Add folder
                      </button>
                      <button className="ghost-button" type="button" onClick={() => openStructureTab("advanced")}>
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
                <section className="panel">
                  <div className="panel__header panel__header--spread">
                    <div>
                      <span className="eyebrow">Sandbox</span>
                      <h3>Output folder and exclusion rules</h3>
                    </div>
                    <button className="secondary-button" type="button" onClick={handleCreateNote}>
                      New note
                    </button>
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
                    <div className="field-grid__wide">
                      <span className="field-label">Excluded folders / files</span>
                      <div className="hero__actions hero__actions--tight">
                        <button className="secondary-button" type="button" onClick={() => handleAddBlockedByBrowse("directory")}>
                          Exclude folder / disk
                        </button>
                        <button className="secondary-button" type="button" onClick={() => handleAddBlockedByBrowse("file")}>
                          Exclude file
                        </button>
                      </div>
                      <BlockedPathList
                        blockedPaths={config.access.blocked_paths ?? []}
                        onRemove={removeBlockedPath}
                      />
                    </div>
                    <label>
                      <span>Blocked patterns</span>
                      <textarea
                        rows="4"
                        value={joinLines(config.access.blocked_patterns)}
                        onChange={(event) => updateAccessField("blocked_patterns", splitLines(event.target.value))}
                        placeholder={"**/*.key\n**/drafts/private/**"}
                      />
                    </label>
                  </div>
                  <p className="microcopy">
                    Every folder or disk you add in Setup is automatically treated as an allowed root. Use exclusions here to define the sandbox boundary.
                  </p>
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
                </section>
              </div>
            </section>
          </>
        ) : null}

        {mainTab === "structure" && structureTab === "graph" ? (
          <>
            <LaneHeader lane="structure" actions={structureActions} />
            {activeResult?.graph?.nodes?.length ? (
              <section className="panel">
                <div className="panel__header panel__header--spread">
                  <div>
                    <span className="eyebrow">Graph</span>
                    <h3>Visual structure of the current workspace</h3>
                  </div>
                  <button className="secondary-button" type="button" onClick={() => openStructureTab("notes")}>
                    Open selected notes
                  </button>
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
                    graph={activeResult?.graph}
                    onSelectNode={(node) => {
                      const file = fileLookup.get(node.id);
                      if (file) {
                        selectFile(file);
                      }
                    }}
                  />
                </Suspense>
              </section>
            ) : (
              <EmptyTabState
                title="No graph yet"
                body="Preview the workspace first. Once files are indexed, the graph will show the source and note relationships here."
                actions={[
                  { label: "Run preview", onClick: () => startWorkspaceJob("preview"), primary: true },
                  guidedDemo ? { label: "Load guided demo", onClick: () => handleLoadExample(guidedDemo, true) } : null,
                ].filter(Boolean)}
              />
            )}
          </>
        ) : null}

        {mainTab === "structure" && structureTab === "notes" ? (
          <>
            <LaneHeader lane="structure" actions={structureActions} />
            {hasFiles ? (
              <section className="notes-grid">
                <ExplorerPane
                  tree={tree}
                  selectedId={selectedFile?.id || ""}
                  expanded={expandedNodes}
                  onToggle={toggleNode}
                  onSelect={selectFile}
                  onOpenQuickSwitcher={() => setQuickOpen(true)}
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
                />
              </section>
            ) : (
              <EmptyTabState
                title="No notes are visible yet"
                body="Preview the current workspace or load the guided demo first. Once files are matched, this tab becomes your reading and editing surface."
                actions={[
                  { label: "Run preview", onClick: () => startWorkspaceJob("preview"), primary: true },
                  guidedDemo ? { label: "Load guided demo", onClick: () => handleLoadExample(guidedDemo, true) } : null,
                ].filter(Boolean)}
              />
            )}
          </>
        ) : null}

        {mainTab === "structure" && structureTab === "canvas" ? (
          <>
            <LaneHeader lane="structure" actions={structureActions} />
            <CanvasBoard
              canvases={canvases}
              selectedCanvasId={selectedCanvasId}
              onSelectCanvas={setSelectedCanvasId}
              onCreateCanvas={handleCreateCanvas}
              onSaveCanvas={handleSaveCanvas}
              onAddFileCard={handleAddFileCard}
              onAddTextCard={handleAddTextCard}
              selectedFile={selectedFile}
            />
          </>
        ) : null}

        {mainTab === "structure" && structureTab === "history" ? (
          <>
            <LaneHeader lane="structure" actions={structureActions} />
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

        {mainTab === "structure" && structureTab === "saved" ? (
          <>
            <LaneHeader lane="structure" actions={structureActions} />
            <section className="vault-layout">
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
                    <span className="eyebrow">Build history</span>
                    <h3>Recent builds</h3>
                  </div>
                </div>
                {buildHistory.length ? (
                  <ul className="compact-list">
                    {buildHistory.map((entry) => (
                      <li key={entry.id}>
                        <strong>{entry.summary?.vault_name || "Vault build"}</strong>
                        <span>{entry.summary?.file_count || 0} files</span>
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

        {mainTab === "structure" && structureTab === "advanced" ? (
          <>
            <LaneHeader lane="structure" actions={structureActions} />
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
