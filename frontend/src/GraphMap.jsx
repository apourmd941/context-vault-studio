import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import ForceGraph3D from "react-force-graph-3d";

import {
  buildGraphFocusOptions,
  filterGraphByFocus,
  graphNodeLabel,
  graphNodeTypeMeta,
  searchGraphNodes,
  selectVisibleGraph,
} from "./lib/graph";
import { localGraph } from "./lib/vault";


const DEFAULT_GRAPH_SIZE = { width: 960, height: 620 };
const DEFAULT_NODE_CAP = 1200;


function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}


function nodeAccent(node, selectedNodeId, highlightNodeIds) {
  if (node.id === selectedNodeId) {
    return "#eef1ff";
  }
  if (highlightNodeIds.has(node.id)) {
    return "#7ce6d3";
  }
  return graphNodeTypeMeta(node).accent;
}


function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}


function buildNodeTooltip(node) {
  const label = escapeHtml(graphNodeLabel(node));
  const path = node.rel_path || node.path || "";
  const source = node.source || node.name || "";
  return [
    `<div><strong>${label}</strong></div>`,
    path ? `<div>${escapeHtml(path)}</div>` : "",
    source ? `<div>${escapeHtml(source)}</div>` : "",
  ]
    .filter(Boolean)
    .join("");
}


function focusNode(graphRef, node, transitionMs = 900) {
  if (!graphRef.current || node?.x == null || node?.y == null || node?.z == null) {
    return;
  }

  const distance = node.type === "source" ? 280 : 170;
  const length = Math.hypot(node.x, node.y, node.z) || 1;
  const ratio = 1 + distance / length;

  graphRef.current.cameraPosition(
    {
      x: node.x * ratio,
      y: node.y * ratio,
      z: node.z * ratio,
    },
    { x: node.x, y: node.y, z: node.z },
    transitionMs,
  );
}


export default function GraphMap({ graph, onSelectNode }) {
  const deferredGraph = useDeferredValue(graph);
  const graphRef = useRef();
  const canvasShellRef = useRef(null);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [maxNodes, setMaxNodes] = useState(DEFAULT_NODE_CAP);
  const [localDepth, setLocalDepth] = useState(0);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [graphSize, setGraphSize] = useState(DEFAULT_GRAPH_SIZE);
  const [activeFocusChipIds, setActiveFocusChipIds] = useState(() => new Set());

  const filteredGraph = useMemo(() => {
    if (!deferredGraph?.nodes?.length) {
      return deferredGraph;
    }
    if (!selectedNodeId || localDepth <= 0) {
      return deferredGraph;
    }
    return localGraph(deferredGraph, selectedNodeId, localDepth);
  }, [deferredGraph, localDepth, selectedNodeId]);

  const sourceScopedGraph = useMemo(() => {
    if (!filteredGraph?.nodes?.length || sourceFilter === "all") {
      return filteredGraph;
    }

    const nodes = filteredGraph.nodes.filter((node) => {
      if (node.type === "source") {
        return node.name === sourceFilter;
      }
      return node.source === sourceFilter;
    });
    const visibleIds = new Set(nodes.map((node) => node.id));

    return {
      nodes,
      edges: (filteredGraph.edges || []).filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to)),
    };
  }, [filteredGraph, sourceFilter]);

  const focusOptions = useMemo(() => buildGraphFocusOptions(sourceScopedGraph), [sourceScopedGraph]);

  const focusedGraph = useMemo(
    () => filterGraphByFocus(sourceScopedGraph, { activeChipIds: activeFocusChipIds }),
    [activeFocusChipIds, sourceScopedGraph],
  );

  const visibleGraph = useMemo(
    () => selectVisibleGraph(focusedGraph, { sourceFilter: "all", maxNodes, selectedNodeId }),
    [focusedGraph, maxNodes, selectedNodeId],
  );

  const sourceOptions = (deferredGraph?.nodes || [])
    .filter((node) => node.type === "source" || node.type === "project")
    .map((node) => node.name || node.label)
    .sort((a, b) => a.localeCompare(b));

  const searchResults = useMemo(() => searchGraphNodes(sourceScopedGraph, searchQuery, 6), [searchQuery, sourceScopedGraph]);

  const selectedNode = visibleGraph.nodes.find((node) => node.id === selectedNodeId) || null;
  const focusChipCount = focusOptions.typeOptions.length + focusOptions.folderOptions.length;
  const focusedNodeCount = focusedGraph?.nodes?.length || 0;

  const highlightNodeIds = useMemo(() => {
    if (!selectedNodeId) {
      return new Set();
    }
    const next = new Set([selectedNodeId]);
    for (const edge of visibleGraph.edges) {
      if (edge.from === selectedNodeId) {
        next.add(edge.to);
      }
      if (edge.to === selectedNodeId) {
        next.add(edge.from);
      }
    }
    return next;
  }, [selectedNodeId, visibleGraph.edges]);

  const graphData = useMemo(
    () => ({
      nodes: visibleGraph.nodes.map((node) => ({ ...node })),
      links: visibleGraph.edges.map((edge) => ({
        ...edge,
        source: edge.from,
        target: edge.to,
      })),
    }),
    [visibleGraph],
  );

  const hiddenNodeCount = Math.max(visibleGraph.totalNodes - visibleGraph.nodes.length, 0);
  const nodeCapMax = Math.max(40, visibleGraph.totalNodes || 40);
  const nodeCapStep = nodeCapMax > 3000 ? 100 : nodeCapMax > 1200 ? 50 : 10;

  useEffect(() => {
    const availableChipIds = new Set([
      ...focusOptions.typeOptions.map((item) => item.id),
      ...focusOptions.folderOptions.map((item) => item.id),
    ]);
    setActiveFocusChipIds((current) => {
      if (!current.size) {
        return current;
      }
      const next = new Set([...current].filter((id) => availableChipIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [focusOptions.folderOptions, focusOptions.typeOptions]);

  useEffect(() => {
    if (!visibleGraph.nodes.length) {
      setSelectedNodeId("");
      return;
    }
    if (!visibleGraph.nodes.some((node) => node.id === selectedNodeId)) {
      const firstSource = visibleGraph.nodes.find((node) => node.type === "source");
      setSelectedNodeId(firstSource?.id || visibleGraph.nodes[0].id);
    }
  }, [selectedNodeId, visibleGraph.nodes]);

  useEffect(() => {
    const shell = canvasShellRef.current;
    if (!shell) {
      return undefined;
    }

    function updateSize() {
      const width = Math.max(Math.floor(shell.clientWidth || DEFAULT_GRAPH_SIZE.width), 320);
      const height = clamp(Math.floor(width * 0.62), 420, 760);
      setGraphSize({ width, height });
    }

    updateSize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSize);
      return () => window.removeEventListener("resize", updateSize);
    }

    const observer = new ResizeObserver(updateSize);
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const graphInstance = graphRef.current;
    if (!graphInstance) {
      return;
    }

    const chargeForce = graphInstance.d3Force("charge");
    chargeForce?.strength?.(visibleGraph.nodes.length > 2400 ? -28 : -54);

    const linkForce = graphInstance.d3Force("link");
    linkForce?.distance?.((link) => (link.type === "links_to" ? 86 : 32));
    linkForce?.strength?.((link) => (link.type === "links_to" ? 0.3 : 0.12));

    const controls = graphInstance.controls?.();
    if (controls) {
      controls.enableDamping = true;
      controls.dampingFactor = 0.12;
      controls.minDistance = 60;
      controls.maxDistance = 6000;
      controls.rotateSpeed = 0.85;
      controls.zoomSpeed = 0.9;
      controls.panSpeed = 0.6;
    }
  }, [visibleGraph.edges.length, visibleGraph.nodes.length]);

  useEffect(() => {
    if (!selectedNodeId || !graphRef.current) {
      return undefined;
    }

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const node = graphData.nodes.find((item) => item.id === selectedNodeId);
      if (node?.x != null && node?.y != null && node?.z != null) {
        focusNode(graphRef, node, attempts === 1 ? 700 : 360);
        window.clearInterval(timer);
      } else if (attempts >= 10) {
        window.clearInterval(timer);
      }
    }, 160);

    return () => window.clearInterval(timer);
  }, [graphData, selectedNodeId]);

  function handleNodeSelect(node) {
    setSelectedNodeId(node.id);
    onSelectNode?.(node);
    focusNode(graphRef, node, 850);
  }

  function handleSearchSelect(node) {
    setSelectedNodeId(node.id);
    setSourceFilter(node.type === "source" || node.type === "project" ? node.name || node.label : node.source || "all");
    setActiveFocusChipIds(new Set());
    setSearchQuery(graphNodeLabel(node));
    setMaxNodes((current) => Math.max(current, Math.min(DEFAULT_NODE_CAP, nodeCapMax)));
    onSelectNode?.(node);
  }

  function toggleFocusChip(chipId) {
    setActiveFocusChipIds((current) => {
      const next = new Set(current);
      if (next.has(chipId)) {
        next.delete(chipId);
      } else {
        next.add(chipId);
      }
      return next;
    });
  }

  if (!deferredGraph?.nodes?.length) {
    return (
      <div className="graph-empty">
        <h3>No graph yet</h3>
        <p>Run a preview or build first. Then the app can render a local graph with notes, sources, and their links.</p>
      </div>
    );
  }

  return (
    <div className="graph-panel">
      <div className="graph-toolbar">
        <label>
          <span>Source filter</span>
          <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
            <option value="all">All sources</option>
            {sourceOptions.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Node cap</span>
          <input
            type="range"
            min="40"
            max={nodeCapMax}
            step={nodeCapStep}
            value={Math.min(maxNodes, nodeCapMax)}
            onChange={(event) => setMaxNodes(Number(event.target.value))}
          />
          <div className="microcopy">
            Rendering {visibleGraph.nodes.length} of {visibleGraph.totalNodes} nodes
          </div>
          {activeFocusChipIds.size > 0 ? (
              <div className="microcopy">
              Focus categories keep {focusedNodeCount} of {sourceScopedGraph?.nodes?.length || 0} indexed nodes visible before the render cap.
            </div>
          ) : null}
          {hiddenNodeCount > 0 ? (
            <>
              <div className="microcopy">The remaining {hiddenNodeCount} stay indexed and searchable.</div>
              <div className="graph-toolbar__actions">
                <button className="ghost-button" type="button" onClick={() => setMaxNodes(visibleGraph.totalNodes)}>
                  Render all filtered nodes
                </button>
              </div>
            </>
          ) : null}
        </label>
        <label>
          <span>Local graph depth</span>
          <input
            type="range"
            min="0"
            max="4"
            step="1"
            value={localDepth}
            onChange={(event) => setLocalDepth(Number(event.target.value))}
          />
          <div className="microcopy">{localDepth === 0 ? "Whole graph" : `${localDepth} hops around selected node`}</div>
        </label>
        <label className="graph-toolbar__search">
          <span>Find node</span>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="README.md or docs/spec"
          />
          <div className="microcopy">Search all indexed files, even when the scene is only rendering a sample.</div>
          {searchQuery.trim() ? (
            <div className="graph-search-results">
              {searchResults.length ? (
                searchResults.map((node) => (
                  <button
                    key={node.id}
                    className="graph-search-result"
                    type="button"
                    onClick={() => handleSearchSelect(node)}
                  >
                    <strong>{graphNodeLabel(node)}</strong>
                    <span>{node.rel_path || node.path || "Source node"}</span>
                    <em>{node.source || node.name || node.type}</em>
                  </button>
                ))
              ) : (
                <p className="graph-search-empty">No indexed node matches that search yet.</p>
              )}
            </div>
          ) : null}
        </label>
      </div>

      <div className="graph-toolbar graph-toolbar--secondary">
        <div className="graph-focus-panel">
          <div className="graph-focus-panel__header">
            <div>
              <span className="eyebrow">Focus categories</span>
              <div className="microcopy">Click one or more categories to keep those nodes visible and hide the rest.</div>
            </div>
            {activeFocusChipIds.size > 0 ? (
              <button className="ghost-button" type="button" onClick={() => setActiveFocusChipIds(new Set())}>
                Clear
              </button>
            ) : null}
          </div>
          {focusChipCount ? (
            <>
              <div className="graph-focus-group">
                <span className="graph-focus-group__title">Node types</span>
                <div className="graph-focus-chip-row">
                  {focusOptions.typeOptions.map((item) => (
                    <button
                      key={item.id}
                      className={`graph-focus-chip ${activeFocusChipIds.has(item.id) ? "graph-focus-chip--active" : ""}`}
                      type="button"
                      onClick={() => toggleFocusChip(item.id)}
                      style={{ "--graph-chip-accent": item.accent }}
                    >
                      <i className="legend-dot" />
                      <strong>{item.label}</strong>
                      <span>{item.count}</span>
                    </button>
                  ))}
                </div>
              </div>
              {focusOptions.folderOptions.length ? (
                <div className="graph-focus-group">
                  <span className="graph-focus-group__title">Top folders</span>
                  <div className="graph-focus-chip-row graph-focus-chip-row--scroll">
                    {focusOptions.folderOptions.map((item) => (
                      <button
                        key={item.id}
                        className={`graph-focus-chip ${activeFocusChipIds.has(item.id) ? "graph-focus-chip--active" : ""}`}
                        type="button"
                        onClick={() => toggleFocusChip(item.id)}
                        style={{ "--graph-chip-accent": item.accent }}
                      >
                        <i className="legend-dot" />
                        <strong>{item.label}</strong>
                        <span>{item.count}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <p className="graph-search-empty">No category chips are available for the current graph scope yet.</p>
          )}
        </div>
        <div className="graph-hint">
          True WebGL view: left-drag to orbit, right-drag to pan, wheel to zoom. Drag a node to pin it in place, right-click a pinned node to release it, and use the focus chips to isolate node types or folders.
        </div>
      </div>

      <div className="graph-grid">
        <div ref={canvasShellRef} className="graph-canvas-shell graph-canvas-shell--webgl">
          <ForceGraph3D
            ref={graphRef}
            graphData={graphData}
            width={graphSize.width}
            height={graphSize.height}
            backgroundColor="#0b0f15"
            showNavInfo={false}
            nodeId="id"
            linkSource="source"
            linkTarget="target"
            numDimensions={3}
            enableNodeDrag
            enableNavigationControls
            nodeRelSize={3.4}
            nodeVal={(node) => {
              if (node.id === selectedNodeId) {
                return 7.4;
              }
              if (node.type === "source") {
                return 5.8;
              }
              if (highlightNodeIds.has(node.id)) {
                return 4.6;
              }
              return 2.5 + Math.min(node.degree || 0, 4) * 0.35;
            }}
            nodeColor={(node) => nodeAccent(node, selectedNodeId, highlightNodeIds)}
            nodeOpacity={0.92}
            nodeResolution={10}
            nodeLabel={buildNodeTooltip}
            linkWidth={(link) => {
              const active = link.source?.id === selectedNodeId || link.target?.id === selectedNodeId || link.source === selectedNodeId || link.target === selectedNodeId;
              if (active) {
                return link.type === "links_to" ? 1.6 : 2.2;
              }
              return link.type === "links_to" ? 0.4 : 0.8;
            }}
            linkOpacity={0.22}
            linkColor={(link) => {
              const active = link.source?.id === selectedNodeId || link.target?.id === selectedNodeId || link.source === selectedNodeId || link.target === selectedNodeId;
              if (active) {
                return "#7ce6d3";
              }
              return link.type === "links_to" ? "rgba(155, 140, 255, 0.42)" : "rgba(190, 196, 224, 0.26)";
            }}
            linkDirectionalParticles={(link) => {
              const active = link.source?.id === selectedNodeId || link.target?.id === selectedNodeId || link.source === selectedNodeId || link.target === selectedNodeId;
              return active ? 2 : 0;
            }}
            linkDirectionalParticleWidth={1.6}
            linkDirectionalParticleSpeed={() => 0.006}
            warmupTicks={60}
            cooldownTicks={visibleGraph.nodes.length > 2400 ? 60 : 110}
            d3AlphaDecay={visibleGraph.nodes.length > 2400 ? 0.08 : 0.045}
            d3VelocityDecay={0.26}
            onNodeClick={handleNodeSelect}
            onNodeDragEnd={(node) => {
              node.fx = node.x;
              node.fy = node.y;
              node.fz = node.z;
            }}
            onNodeRightClick={(node) => {
              delete node.fx;
              delete node.fy;
              delete node.fz;
              graphRef.current?.d3ReheatSimulation();
            }}
            onBackgroundClick={() => graphRef.current?.zoomToFit(700, 80)}
            showPointerCursor
          />
        </div>

        <aside className="graph-details">
          {selectedNode ? (
            <>
              <span className="eyebrow">Selected node</span>
              <h3>{graphNodeLabel(selectedNode)}</h3>
              <div className="graph-detail-list">
                <div>
                  <span>Type</span>
                  <strong>{selectedNode.type}</strong>
                </div>
                <div>
                  <span>Source</span>
                  <strong>{selectedNode.source || selectedNode.name || "—"}</strong>
                </div>
                <div>
                  <span>Path</span>
                  <code>{selectedNode.rel_path || selectedNode.path || "—"}</code>
                </div>
                <div>
                  <span>Degree</span>
                  <strong>{selectedNode.degree}</strong>
                </div>
                <div>
                  <span>Pinned</span>
                  <strong>{selectedNode.fx != null || selectedNode.fy != null || selectedNode.fz != null ? "Yes" : "No"}</strong>
                </div>
                <div>
                  <span>Visible now</span>
                  <strong>
                    {visibleGraph.nodes.length} / {visibleGraph.totalNodes}
                  </strong>
                </div>
              </div>
              {selectedNode.summary ? <p className="graph-summary">{selectedNode.summary}</p> : null}
            </>
          ) : (
            <p className="empty-copy">Choose a node to inspect its details.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
