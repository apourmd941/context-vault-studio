import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";

import ExplorerPane from "./ExplorerPane";
import GraphMap from "./GraphMap";
import {
  createJob,
  createPreset,
  deletePreset,
  fetchBootstrap,
  fetchBuildHistory,
  fetchFilePreview,
  fetchJob,
  inspectPath,
  saveWorkspaceConfig,
} from "./api";
import PresetPanel from "./PresetPanel";
import PreviewPane from "./PreviewPane";
import QuickSwitcher from "./QuickSwitcher";
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
            placeholder="Neutron docs"
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
              placeholder="/absolute/path/or/~/Documents"
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
            placeholder={"node_modules/**\nbuild/**"}
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
    return <p className="empty-copy">Run a preview to see which files will make it into the vault.</p>;
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
  const [appInfo, setAppInfo] = useState(null);
  const [examples, setExamples] = useState([]);
  const [presets, setPresets] = useState([]);
  const [buildHistory, setBuildHistory] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [activeJobId, setActiveJobId] = useState("");
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
  const sourceCount = deferredSources.length;
  const includePatternCount = deferredSources.reduce((total, source) => total + (source.include?.length ?? 0), 0);
  const blockedRuleCount =
    (config.access?.blocked_paths?.length ?? 0) + (config.access?.blocked_patterns?.length ?? 0);
  const tree = useMemo(() => buildFileTree(files), [files]);
  const searchResults = useMemo(() => searchFiles(files, quickQuery, 24), [files, quickQuery]);
  const adjacency = useMemo(() => buildAdjacency(activeResult?.graph ?? { nodes: [], edges: [] }), [activeResult]);
  const fileLookup = useMemo(() => new Map(files.map((file) => [file.id, file])), [files]);

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
          setJobs(payload.jobs ?? []);
          setConfig(normalizeConfig(payload.config));
          setBuildResult(normalizeResult(payload.last_result));
          setPreview(normalizeResult(payload.last_result));
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
    setSelectedFile(files[0]);
  }, [fileLookup, files, selectedFile, tree]);

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
          } else {
            setBuildResult(result);
            setPreview(result);
            setBuildHistory(await fetchBuildHistory());
          }
          setNotice(`${job.kind} completed.`);
          setBusy("");
          setActiveJobId("");
        } else if (job.status === "failed") {
          setError(job.error || "Job failed");
          setBusy("");
          setActiveJobId("");
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

  function patchConfig(nextConfig) {
    setConfig(normalizeConfig(nextConfig));
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
      setNotice("Workspace layout saved.");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy("");
    }
  }

  async function startWorkspaceJob(kind) {
    setBusy(kind);
    setError("");
    setNotice("");
    try {
      const job = await createJob(kind, serializeConfig(config), true);
      setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)].slice(0, 12));
      setActiveJobId(job.id);
    } catch (jobError) {
      setError(jobError.message);
      setBusy("");
    }
  }

  function loadExample(example) {
    patchConfig(normalizeConfig(example.config));
    setNotice(`${example.label} loaded.`);
  }

  function loadPreset(preset) {
    patchConfig(normalizeConfig(preset.config));
    setNotice(`${preset.name} loaded.`);
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

  function selectFile(file) {
    setSelectedFile(file);
    setQuickOpen(false);
    setActiveTab("notes");
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
            <span className="eyebrow">Linked vault workbench</span>
            <h1>Context Vault Studio</h1>
          </div>
        </div>

        <div className="sidebar__panel">
          <span className="eyebrow">App</span>
          <p className="sidebar-copy">
            {appInfo?.description || "Obsidian-inspired curated AI workspace builder."}
          </p>
          <div className="sidebar-meta">
            <span>{appInfo?.id}</span>
            <span>{appInfo?.repo_root}</span>
          </div>
        </div>

        <div className="sidebar__panel">
          <span className="eyebrow">Templates</span>
          <div className="example-stack">
            {examples.map((example) => (
              <button key={example.id} className="example-card" type="button" onClick={() => loadExample(example)}>
                <strong>{example.label}</strong>
                <span>{example.description}</span>
              </button>
            ))}
          </div>
        </div>

        <PresetPanel
          presets={presets}
          buildHistory={buildHistory}
          jobs={jobs}
          onLoadPreset={loadPreset}
          onSavePreset={handleSavePreset}
          onDeletePreset={handleDeletePreset}
        />

        <div className="sidebar__panel">
          <span className="eyebrow">Boundary notes</span>
          <ul className="sidebar-list">
            <li>Allowed roots define where the app is permitted to look.</li>
            <li>Blocked paths and patterns override everything else.</li>
            <li>For a real AI boundary, point agents at the generated vault or this app only.</li>
          </ul>
        </div>
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

        <section className="hero">
          <div>
            <span className="eyebrow">Curated access over brute-force context</span>
            <h2>Shape the corpus before Claude or Codex ever starts reading.</h2>
            <p>
              Build a smaller, intentional vault from docs, projects, manuals, and selected repos, then expose only
              that generated workspace to your agents.
            </p>
          </div>
          <div className="hero__actions">
            <button className="secondary-button" type="button" onClick={handleSave} disabled={!!busy}>
              {busy === "save" ? "Saving..." : "Save layout"}
            </button>
            <button className="secondary-button" type="button" onClick={() => startWorkspaceJob("preview")} disabled={!!busy}>
              {busy === "preview" ? "Previewing..." : "Preview"}
            </button>
            <button className="primary-button" type="button" onClick={() => startWorkspaceJob("build")} disabled={!!busy}>
              {busy === "build" ? "Building..." : "Build vault"}
            </button>
            <button className="ghost-button" type="button" onClick={exportConfig}>
              Export JSON
            </button>
          </div>
        </section>

        {error ? <div className="callout callout--error">{error}</div> : null}
        {notice ? <div className="callout callout--success">{notice}</div> : null}
        {busy === "boot" ? <div className="callout">Loading workspace…</div> : null}
        {activeJobId ? (
          <div className="callout">
            {(jobs.find((job) => job.id === activeJobId)?.message || "Working")}{" "}
            {jobs.find((job) => job.id === activeJobId)?.progress ?? 0}%
          </div>
        ) : null}

        <section className="dashboard-grid">
          <div className="panel">
            <div className="panel__header">
              <div>
                <span className="eyebrow">Vault settings</span>
                <h3>Workspace contract</h3>
              </div>
            </div>
            <div className="field-grid">
              <label>
                <span>Vault name</span>
                <input value={config.vault_name} onChange={(event) => updateField("vault_name", event.target.value)} />
              </label>
              <label>
                <span>Output directory</span>
                <input value={config.output_dir} onChange={(event) => updateField("output_dir", event.target.value)} />
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
                />
              </label>
              <label>
                <span>Default exclude patterns</span>
                <textarea
                  rows="4"
                  value={joinLines(config.default_exclude)}
                  onChange={(event) => updateField("default_exclude", splitLines(event.target.value))}
                />
              </label>
            </div>
          </div>

          <div className="panel panel--metrics">
            <div className="panel__header">
              <div>
                <span className="eyebrow">Signal</span>
                <h3>Current lens</h3>
              </div>
            </div>
            <div className="metrics-grid">
              <MetricCard label="Sources" value={sourceCount} hint="Scoped folders in this layout" />
              <MetricCard label="Patterns" value={includePatternCount} hint="Include rules across all sources" />
              <MetricCard label="Allowed roots" value={config.access.allowed_roots.length} hint="Top-level app boundary" />
              <MetricCard label="Blocked rules" value={blockedRuleCount} hint="Paths and patterns denied" />
              <MetricCard label="Files" value={activeResult?.summary?.file_count ?? "—"} hint="Matched on last result" />
              <MetricCard label="Edges" value={activeResult?.summary?.edge_count ?? "—"} hint="Visible graph connections" />
            </div>
            <div className="build-facts">
              <div>
                <span className="eyebrow">Output path</span>
                <div className="microcopy">{config.output_dir || "Not set yet"}</div>
              </div>
              <div>
                <span className="eyebrow">Boundary mode</span>
                <div className="microcopy">
                  {config.access.enforce_copy_mode ? "Copy-only enforced" : "Source mode decides"}
                </div>
              </div>
            </div>
          </div>
        </section>

        {activeTab === "vault" ? (
          <>
            <section className="panel">
              <div className="panel__header">
                <div>
                  <span className="eyebrow">Access control</span>
                  <h3>What the app is allowed to see</h3>
                </div>
              </div>
              <div className="field-grid">
                <label>
                  <span>Allowed roots</span>
                  <textarea
                    rows="5"
                    value={joinLines(config.access.allowed_roots)}
                    onChange={(event) => updateAccessField("allowed_roots", splitLines(event.target.value))}
                    placeholder={"/Users/aidin/Documents\n/Users/aidin/NeutronDev/neutron5"}
                  />
                </label>
                <label>
                  <span>Blocked paths</span>
                  <textarea
                    rows="5"
                    value={joinLines(config.access.blocked_paths)}
                    onChange={(event) => updateAccessField("blocked_paths", splitLines(event.target.value))}
                    placeholder={"/Users/aidin/Private\n/Users/aidin/NeutronDev/secrets"}
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
                <span>Force copy-only builds so the generated vault becomes a hard curated boundary.</span>
              </label>
            </section>

            <section className="panel">
              <div className="panel__header panel__header--spread">
                <div>
                  <span className="eyebrow">Sources</span>
                  <h3>Curate what the model can see</h3>
                </div>
                <button className="primary-button" type="button" onClick={addSource}>
                  Add source
                </button>
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
                <div className="empty-state">
                  <h3>No sources yet</h3>
                  <p>Add the folders you want in the generated vault, then preview before building.</p>
                </div>
              )}
            </section>

            <section className="panel">
              <div className="panel__header">
                <div>
                  <span className="eyebrow">Map summary</span>
                  <h3>What the current result includes</h3>
                </div>
              </div>
              <SourceSummaryList sourceSummaries={activeResult?.source_summaries} />
            </section>
          </>
        ) : null}

        {activeTab === "notes" ? (
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
            />
          </section>
        ) : null}

        {activeTab === "graph" ? (
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
        ) : null}
      </main>
    </div>
  );
}
