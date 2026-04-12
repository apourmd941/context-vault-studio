import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";

import BookmarkPanel from "./BookmarkPanel";
import CanvasBoard from "./CanvasBoard";
import ExplorerPane from "./ExplorerPane";
import GraphMap from "./GraphMap";
import {
  createBookmark,
  createCanvas,
  createFile,
  createJob,
  createPreset,
  deletePreset,
  exportBundle,
  fetchBootstrap,
  fetchBuildHistory,
  fetchFilePreview,
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
  include: ["README.md"],
  exclude: [],
  mode: "copy",
  max_file_size_bytes: "",
};

const TAB_COPY = {
  vault: {
    eyebrow: "Vault builder",
    title: "Pick the exact folders and notes the model should be allowed to use.",
    description:
      "This is the setup screen. Load a demo, add a real source, preview the match set, then build a curated vault.",
  },
  notes: {
    eyebrow: "Notes workspace",
    title: "Read and edit the files that made it into the current lens.",
    description:
      "Notes is for browsing matched files, following links, and editing the content you want inside the curated workspace.",
  },
  canvas: {
    eyebrow: "Canvas board",
    title: "Arrange files and ideas on a visual board once the workspace has content.",
    description:
      "Canvas should feel like a workspace, not another config page. Add selected files, sketch ideas, and save the board.",
  },
  graph: {
    eyebrow: "Graph map",
    title: "See the local structure of the current workspace instead of guessing it.",
    description:
      "Graph focuses on relationships and entry points. Preview first, then use the map to decide what to open next.",
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
  return {
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
  };
}


function serializeConfig(config) {
  return {
    ...config,
    output_dir: config.output_dir || createEmptyConfig().output_dir,
    max_file_size_bytes: Number(config.max_file_size_bytes) || 1,
    access: {
      ...config.access,
      allowed_roots: [...(config.access?.allowed_roots ?? [])],
      blocked_paths: [...(config.access?.blocked_paths ?? [])],
      blocked_patterns: [...(config.access?.blocked_patterns ?? [])],
      enforce_copy_mode: Boolean(config.access?.enforce_copy_mode),
    },
    sources: config.sources.map((source) => ({
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


function ViewHeader({ tab, actions }) {
  const copy = TAB_COPY[tab];
  return (
    <section className={`view-header view-header--${tab}`}>
      <div className="view-header__body">
        <span className="eyebrow">{copy.eyebrow}</span>
        <h2>{copy.title}</h2>
        <p>{copy.description}</p>
      </div>
      <div className="view-header__actions">{actions}</div>
    </section>
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
        ? `${hasSources} source${hasSources > 1 ? "s" : ""} already in the workspace.`
        : "Load the bundled demo or add your own first source.",
      actionLabel: demoExample ? "Load guided demo" : "Add first source",
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


function ResultSpotlight({ result, outputDir, onOpenNotes, onOpenGraph }) {
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
    </section>
  );
}


function SourceCard({
  source,
  index,
  onChange,
  onRemove,
  onInspect,
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
          <span className="eyebrow">Source {index + 1}</span>
          <h3>{source.name || "Untitled source"}</h3>
        </div>
        <button className="ghost-button" type="button" onClick={() => onRemove(index)}>
          Remove
        </button>
      </div>

      <div className="field-grid">
        <label>
          <span>Name</span>
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
          <span>Path</span>
          <div className="path-field">
            <input
              value={source.path}
              onChange={(event) => onChange(index, "path", event.target.value)}
              placeholder="../Documents or ../../projects/my-repo"
            />
            <button
              className="secondary-button"
              type="button"
              onClick={() => onInspect(index)}
              disabled={!source.path || inspectBusy}
            >
              {inspectBusy ? "Peeking..." : "Peek path"}
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


export default function App() {
  const [activeTab, setActiveTab] = useState("vault");
  const [vaultMode, setVaultMode] = useState("basic");
  const [appInfo, setAppInfo] = useState(null);
  const [examples, setExamples] = useState([]);
  const [presets, setPresets] = useState([]);
  const [buildHistory, setBuildHistory] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
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
          setCanvases(payload.canvases ?? []);
          setSelectedCanvasId((payload.canvases ?? [])[0]?.id || "");
          setJobs(payload.jobs ?? []);
          setConfig(normalizeConfig(payload.config));
          setLayout(payload.layout ?? layout);
          setBuildResult(normalizeResult(payload.last_result));
          setPreview(normalizeResult(payload.last_result));
          setActiveTab("vault");
          setVaultMode("basic");
          if (!(payload.last_result?.summary?.file_count > 0)) {
            setNotice(
              (payload.config?.sources ?? []).length
                ? "Preview the current demo workspace to populate Notes, Canvas, and Graph."
                : "Load the guided demo or add a source to get a first working result.",
            );
          }
        });
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
            setNotice(
              result.summary?.file_count
                ? `Preview ready. ${result.summary.file_count} files are now visible in the workspace.`
                : "Preview finished, but nothing matched yet. Adjust sources or patterns.",
            );
            setActiveTab(result.summary?.file_count ? "graph" : "vault");
          } else {
            setBuildResult(result);
            setPreview(result);
            setBuildHistory(await fetchBuildHistory());
            setNotice(
              `Vault built with ${result.summary?.file_count ?? 0} files at ${
                result.artifacts?.vault_dir || result.artifacts?.output_dir
              }.`,
            );
            setActiveTab(result.summary?.file_count ? "notes" : "vault");
          }
          setBusy("");
          setActiveJobId("");
        } else if (job.status === "failed") {
          setError(job.error || "Job failed");
          setBusy("");
          setActiveJobId("");
          setActiveTab("vault");
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

  function addSource() {
    patchConfig({ ...config, sources: [...config.sources, { ...EMPTY_SOURCE }] });
  }

  function removeSource(index) {
    patchConfig({ ...config, sources: config.sources.filter((_, sourceIndex) => sourceIndex !== index) });
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
      return "Load the guided demo or add at least one source before running preview or build.";
    }

    const incompleteSource = nextConfig.sources.find((source) => !source.path?.trim() || !source.name?.trim());
    if (incompleteSource) {
      return "Each source needs both a name and a folder path before preview or build can run.";
    }

    return "";
  }

  async function handleInspect(index) {
    const source = config.sources[index];
    if (!source?.path) {
      return;
    }
    setInspectBusyIndex(index);
    setError("");
    try {
      const payload = await inspectPath(source.path, config.access);
      setInspectResults((current) => ({ ...current, [index]: payload }));
    } catch (inspectError) {
      setError(inspectError.message);
    } finally {
      setInspectBusyIndex(-1);
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
      setActiveTab("vault");
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
    setActiveTab("vault");
    if (autoPreview && nextConfig.sources.length) {
      await startWorkspaceJob("preview", nextConfig);
    } else {
      setNotice(`${example.label} loaded.`);
    }
  }

  function loadPreset(preset) {
    patchConfig(normalizeConfig(preset.config));
    setNotice(`${preset.name} loaded.`);
    setActiveTab("vault");
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
      setActiveTab("vault");
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
      setActiveTab("canvas");
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
    setActiveTab("notes");
  }

  function selectBookmark(bookmark) {
    if (bookmark.type === "file") {
      const match = files.find((file) => file.original_path === bookmark.path || file.id === bookmark.file_id);
      if (match) {
        selectFile(match);
      }
    }
  }

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
            <span className="eyebrow">Curated vault workbench</span>
            <h1>Context Vault Studio</h1>
          </div>
        </div>

        {activeTab === "vault" ? (
          <>
            <div className="sidebar__panel">
              <span className="eyebrow">App</span>
              <p className="sidebar-copy">
                {appInfo?.description || "Obsidian-inspired curated AI workspace builder."}
              </p>
              <div className="sidebar-meta">
                <span>{appInfo?.id}</span>
                <span>{hasFiles ? `${files.length} files visible now` : "No files loaded yet"}</span>
              </div>
            </div>

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

            {vaultMode === "advanced" ? (
              <PresetPanel
                presets={presets}
                buildHistory={buildHistory}
                jobs={jobs}
                onLoadPreset={loadPreset}
                onSavePreset={handleSavePreset}
                onDeletePreset={handleDeletePreset}
              />
            ) : (
              <div className="sidebar__panel">
                <span className="eyebrow">Mode</span>
                <p className="sidebar-copy">
                  You are in basic mode. The setup forms stay hidden until you open advanced mode.
                </p>
              </div>
            )}
          </>
        ) : null}

        {activeTab === "notes" ? (
          <>
            <div className="sidebar__panel">
              <span className="eyebrow">Notes</span>
              <p className="sidebar-copy">
                Browse the matched files, open linked notes, and bookmark the ones you want to revisit.
              </p>
            </div>
            <BookmarkPanel bookmarks={bookmarks} onSelectBookmark={selectBookmark} />
            <SnapshotPanel snapshots={snapshots} onRestore={handleRestoreSnapshot} />
          </>
        ) : null}

        {activeTab === "canvas" ? (
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

        {activeTab === "graph" ? (
          <>
            <div className="sidebar__panel">
              <span className="eyebrow">Graph tips</span>
              <ul className="sidebar-list">
                <li>Preview or build first so the graph has real nodes.</li>
                <li>Use the graph to choose what to open next, not as another config form.</li>
                <li>Click a node to jump directly into Notes.</li>
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
      </aside>

      <main className="workspace">
        <div className="window-bar">
          <span className="window-dot" />
          <span className="window-dot" />
          <span className="window-dot" />
          <div className="window-tabs">
            {[
              ["vault", "Vault"],
              ["notes", "Notes"],
              ["canvas", "Canvas"],
              ["graph", "Graph"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={`window-tab ${activeTab === id ? "window-tab--active" : ""}`}
                type="button"
                onClick={() => setActiveTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
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

        {activeTab === "vault" ? (
          <>
            <ViewHeader
              tab="vault"
              actions={
                <>
                  {guidedDemo ? (
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => handleLoadExample(guidedDemo, true)}
                      disabled={!!busy}
                    >
                      Load demo
                    </button>
                  ) : null}
                  <button className="secondary-button" type="button" onClick={addSource} disabled={!!busy}>
                    Add source
                  </button>
                  <button className="secondary-button" type="button" onClick={() => startWorkspaceJob("preview")} disabled={!!busy}>
                    {busy === "preview" ? "Previewing..." : "Preview"}
                  </button>
                  <button className="primary-button" type="button" onClick={() => startWorkspaceJob("build")} disabled={!!busy}>
                    {busy === "build" ? "Building..." : "Build vault"}
                  </button>
                  <button
                    className={vaultMode === "advanced" ? "ghost-button" : "secondary-button"}
                    type="button"
                    onClick={() => setVaultMode((current) => (current === "advanced" ? "basic" : "advanced"))}
                  >
                    {vaultMode === "advanced" ? "Basic mode" : "Advanced mode"}
                  </button>
                </>
              }
            />

            <section className="vault-home-grid">
              <section className="panel">
                <div className="panel__header panel__header--spread">
                  <div>
                    <span className="eyebrow">Workspace map</span>
                    <h3>See the current workspace first</h3>
                  </div>
                  <button className="secondary-button" type="button" onClick={() => setActiveTab("graph")}>
                    Open graph
                  </button>
                </div>
                {activeResult?.graph?.nodes?.length ? (
                  <GraphMap
                    graph={activeResult.graph}
                    onSelectNode={(node) => {
                      const file = fileLookup.get(node.id);
                      if (file) {
                        selectFile(file);
                      }
                    }}
                  />
                ) : (
                  <EmptyTabState
                    title="No map yet"
                    body="Run preview or load the guided demo. Once the workspace is indexed, the graph will appear here."
                    actions={[
                      guidedDemo ? { label: "Load guided demo", onClick: () => handleLoadExample(guidedDemo, true), primary: true } : null,
                      { label: "Run preview", onClick: () => startWorkspaceJob("preview") },
                    ].filter(Boolean)}
                  />
                )}
              </section>

              <div className="vault-home-side">
                <section className="panel">
                  <div className="panel__header">
                    <div>
                      <span className="eyebrow">Essential actions</span>
                      <h3>Do the main thing quickly</h3>
                    </div>
                  </div>
                  <div className="quickstart-grid quickstart-grid--stack">
                    <article className="quickstart-card">
                      <strong>Load a working demo</strong>
                      <p>Use the bundled sample vault if you want to test the app without touching your real folders.</p>
                      <button className="secondary-button" type="button" onClick={() => handleLoadExample(guidedDemo, true)}>
                        Load guided demo
                      </button>
                    </article>
                    <article className="quickstart-card">
                      <strong>Preview the current scope</strong>
                      <p>Check what will be included before you build the actual vault.</p>
                      <button className="secondary-button" type="button" onClick={() => startWorkspaceJob("preview")}>
                        Run preview
                      </button>
                    </article>
                    <article className="quickstart-card">
                      <strong>Build the vault</strong>
                      <p>Create the Obsidian-friendly vault and graph artifacts from the current rules.</p>
                      <button className="primary-button" type="button" onClick={() => startWorkspaceJob("build")}>
                        Build vault
                      </button>
                    </article>
                  </div>
                </section>

                <ResultSpotlight
                  result={activeResult}
                  outputDir={buildResult?.artifacts?.vault_dir}
                  onOpenNotes={() => setActiveTab("notes")}
                  onOpenGraph={() => setActiveTab("graph")}
                />

                <section className="panel">
                  <div className="panel__header">
                    <div>
                      <span className="eyebrow">At a glance</span>
                      <h3>Current workspace status</h3>
                    </div>
                  </div>
                  <div className="metrics-grid">
                    <MetricCard label="Sources" value={hasSources ? deferredSources.length : 0} hint="Folders in scope" />
                    <MetricCard label="Files" value={activeResult?.summary?.file_count ?? "—"} hint="Matched on preview/build" />
                    <MetricCard label="Edges" value={activeResult?.summary?.edge_count ?? "—"} hint="Graph relationships" />
                    <MetricCard label="Blocked rules" value={blockedRuleCount} hint="Paths and patterns denied" />
                  </div>
                  {recentFiles.length ? (
                    <ul className="compact-list compact-list--tight">
                      {recentFiles.map((file) => (
                        <li key={file.id}>
                          <strong>{file.label}</strong>
                          <span>{file.source_name}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              </div>
            </section>

            {vaultMode === "advanced" ? (
              <section className="vault-layout">
                <div className="vault-layout__main">
                <section className="panel">
                  <div className="panel__header panel__header--spread">
                    <div>
                      <span className="eyebrow">Sources</span>
                      <h3>Choose the folders the app is allowed to map</h3>
                    </div>
                    <div className="hero__actions hero__actions--tight">
                      <button className="primary-button" type="button" onClick={addSource}>
                        Add source
                      </button>
                      <button className="secondary-button" type="button" onClick={handleCreateNote}>
                        New note
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
                          onInspect={handleInspect}
                          inspectResult={inspectResults[index]}
                          inspectBusy={inspectBusyIndex === index}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyTabState
                      title="Nothing has been scoped yet"
                      body="Load the guided demo if you want something that works immediately, or add your own first source folder."
                      actions={[
                        guidedDemo
                          ? {
                              label: "Load guided demo",
                              onClick: () => handleLoadExample(guidedDemo, true),
                              primary: true,
                            }
                          : { label: "Add first source", onClick: addSource, primary: true },
                        { label: "Add first source", onClick: addSource },
                      ]}
                    />
                  )}
                </section>

                <section className="panel">
                  <div className="panel__header">
                    <div>
                      <span className="eyebrow">Workspace settings</span>
                      <h3>Set the build destination and default rules</h3>
                    </div>
                  </div>
                  <div className="field-grid">
                    <label>
                      <span>Vault name</span>
                      <input value={config.vault_name} onChange={(event) => updateField("vault_name", event.target.value)} />
                    </label>
                    <label>
                      <span>Output directory</span>
                      <input
                        value={config.output_dir}
                        onChange={(event) => updateField("output_dir", event.target.value)}
                        placeholder="../build/context-vault-studio"
                      />
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
                  </div>
                </section>
                </div>

                <div className="vault-layout__side">
                  <section className="panel">
                    <div className="panel__header panel__header--spread">
                      <div>
                        <span className="eyebrow">Boundary</span>
                        <h3>Tell the app where it may and may not look</h3>
                      </div>
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
                    <div className="field-grid">
                      <label>
                        <span>Allowed roots</span>
                        <textarea
                          rows="5"
                          value={joinLines(config.access.allowed_roots)}
                          onChange={(event) => updateAccessField("allowed_roots", splitLines(event.target.value))}
                          placeholder={"../Documents\n../../projects/my-repo"}
                        />
                      </label>
                      <label>
                        <span>Blocked paths</span>
                        <textarea
                          rows="5"
                          value={joinLines(config.access.blocked_paths)}
                          onChange={(event) => updateAccessField("blocked_paths", splitLines(event.target.value))}
                          placeholder={"../Private\n../../secrets"}
                        />
                      </label>
                      <label className="field-grid__wide">
                        <span>Blocked patterns</span>
                        <textarea
                          rows="4"
                          value={joinLines(config.access.blocked_patterns)}
                          onChange={(event) => updateAccessField("blocked_patterns", splitLines(event.target.value))}
                          placeholder={"**/*.key\n**/drafts/private/**"}
                        />
                      </label>
                    </div>
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={config.access.enforce_copy_mode}
                        onChange={(event) => updateAccessField("enforce_copy_mode", event.target.checked)}
                      />
                      <span>Force copy-only builds so the generated vault becomes the hard curated boundary.</span>
                    </label>
                  </section>

                  <section className="panel panel--metrics">
                    <div className="panel__header">
                      <div>
                        <span className="eyebrow">Current lens</span>
                        <h3>What the workspace sees right now</h3>
                      </div>
                    </div>
                    <div className="metrics-grid">
                      <MetricCard label="Sources" value={hasSources ? deferredSources.length : 0} hint="Folders in scope" />
                      <MetricCard label="Blocked rules" value={blockedRuleCount} hint="Paths and patterns denied" />
                      <MetricCard label="Files" value={activeResult?.summary?.file_count ?? "—"} hint="Matched on preview/build" />
                      <MetricCard label="Edges" value={activeResult?.summary?.edge_count ?? "—"} hint="Graph relationships" />
                    </div>
                    <div className="build-facts">
                      <div>
                        <span className="eyebrow">Output path</span>
                        <div className="microcopy">{config.output_dir || "Not set yet"}</div>
                      </div>
                      <div>
                        <span className="eyebrow">Last job</span>
                        <div className="microcopy">{latestJob ? `${latestJob.kind}: ${latestJob.status}` : "No jobs yet"}</div>
                      </div>
                    </div>
                  </section>

                  <section className="panel">
                    <div className="panel__header">
                      <div>
                        <span className="eyebrow">Matched content</span>
                        <h3>What the current result includes</h3>
                      </div>
                    </div>
                    <SourceSummaryList sourceSummaries={activeResult?.source_summaries} />
                  </section>
                </div>
              </section>
            ) : null}
          </>
        ) : null}

        {activeTab === "notes" ? (
          <>
            <ViewHeader
              tab="notes"
              actions={
                <>
                  <button className="secondary-button" type="button" onClick={() => setQuickOpen(true)}>
                    Quick open
                  </button>
                  <button className="secondary-button" type="button" onClick={() => startWorkspaceJob("preview")} disabled={!!busy}>
                    Refresh preview
                  </button>
                </>
              }
            />
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

        {activeTab === "canvas" ? (
          <>
            <ViewHeader
              tab="canvas"
              actions={
                <>
                  <button className="secondary-button" type="button" onClick={handleCreateCanvas}>
                    New canvas
                  </button>
                  <button className="secondary-button" type="button" onClick={() => setActiveTab("notes")}>
                    Pick a file
                  </button>
                </>
              }
            />
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

        {activeTab === "graph" ? (
          <>
            <ViewHeader
              tab="graph"
              actions={
                <>
                  <button className="secondary-button" type="button" onClick={() => startWorkspaceJob("preview")} disabled={!!busy}>
                    Refresh graph
                  </button>
                  <button className="secondary-button" type="button" onClick={() => setActiveTab("notes")}>
                    Open notes
                  </button>
                </>
              }
            />
            {activeResult?.graph?.nodes?.length ? (
              <section className="panel">
                <div className="panel__header">
                  <div>
                    <span className="eyebrow">Graph</span>
                    <h3>Obsidian-style local map</h3>
                  </div>
                </div>
                <GraphMap
                  graph={activeResult?.graph}
                  onSelectNode={(node) => {
                    const file = fileLookup.get(node.id);
                    if (file) {
                      selectFile(file);
                    }
                  }}
                />
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
      </main>
    </div>
  );
}
