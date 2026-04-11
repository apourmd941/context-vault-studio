import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { localGraph } from "./lib/vault";


const WIDTH = 1080;
const HEIGHT = 620;


function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}


function nodeLabel(node) {
  return node.name || node.label || node.rel_path || node.id;
}


function nodeAccent(node) {
  if (node.type === "source") {
    return "#7ce6d3";
  }
  if ((node.extension || "").toLowerCase() === ".md") {
    return "#9b8cff";
  }
  return "#f6c177";
}


function buildLayout(graph, sourceFilter, maxNodes) {
  if (!graph?.nodes?.length) {
    return { nodes: [], edges: [], totalNodes: 0 };
  }

  let nodes = graph.nodes;
  if (sourceFilter !== "all") {
    nodes = nodes.filter((node) => {
      if (node.type === "source") {
        return node.name === sourceFilter;
      }
      return node.source === sourceFilter;
    });
  }

  const visibleIds = new Set(nodes.map((node) => node.id));
  let edges = (graph.edges || []).filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to));

  const degrees = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    degrees.set(edge.from, (degrees.get(edge.from) || 0) + 1);
    degrees.set(edge.to, (degrees.get(edge.to) || 0) + 1);
  }

  const sourceNodes = nodes
    .filter((node) => node.type === "source")
    .sort((a, b) => nodeLabel(a).localeCompare(nodeLabel(b)));
  const fileNodes = nodes
    .filter((node) => node.type !== "source")
    .sort((a, b) => (degrees.get(b.id) || 0) - (degrees.get(a.id) || 0) || nodeLabel(a).localeCompare(nodeLabel(b)));

  const cappedNodes = [...sourceNodes, ...fileNodes].slice(0, Math.max(18, Math.min(maxNodes, nodes.length)));
  const cappedIds = new Set(cappedNodes.map((node) => node.id));
  edges = edges.filter((edge) => cappedIds.has(edge.from) && cappedIds.has(edge.to));

  const finalDegrees = new Map(cappedNodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    finalDegrees.set(edge.from, (finalDegrees.get(edge.from) || 0) + 1);
    finalDegrees.set(edge.to, (finalDegrees.get(edge.to) || 0) + 1);
  }

  const seededNodes = cappedNodes.map((node, index) => {
    const angle = (index / Math.max(cappedNodes.length, 1)) * Math.PI * 2;
    const radius = 90 + (index / Math.max(cappedNodes.length, 1)) * Math.min(WIDTH, HEIGHT) * 0.34;
    return {
      ...node,
      degree: finalDegrees.get(node.id) || 0,
      x: WIDTH / 2 + Math.cos(angle) * radius,
      y: HEIGHT / 2 + Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
    };
  });

  const nodeIndex = new Map(seededNodes.map((node, index) => [node.id, index]));
  const iterations = 140;
  const repulsion = 9200;
  const spring = 0.016;
  const preferredDistance = 94;
  const centerPull = 0.0055;
  const damping = 0.82;

  for (let step = 0; step < iterations; step += 1) {
    const forces = seededNodes.map(() => ({ x: 0, y: 0 }));

    for (let i = 0; i < seededNodes.length; i += 1) {
      for (let j = i + 1; j < seededNodes.length; j += 1) {
        const first = seededNodes[i];
        const second = seededNodes[j];
        let dx = second.x - first.x;
        let dy = second.y - first.y;
        let distanceSquared = dx * dx + dy * dy;
        if (distanceSquared < 1) {
          distanceSquared = 1;
          dx = 1;
          dy = 0;
        }
        const distance = Math.sqrt(distanceSquared);
        const force = repulsion / distanceSquared;
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        forces[i].x -= fx;
        forces[i].y -= fy;
        forces[j].x += fx;
        forces[j].y += fy;
      }
    }

    for (const edge of edges) {
      const fromIndex = nodeIndex.get(edge.from);
      const toIndex = nodeIndex.get(edge.to);
      if (fromIndex == null || toIndex == null) {
        continue;
      }
      const fromNode = seededNodes[fromIndex];
      const toNode = seededNodes[toIndex];
      const dx = toNode.x - fromNode.x;
      const dy = toNode.y - fromNode.y;
      const distance = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const force = (distance - preferredDistance) * spring;
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;
      forces[fromIndex].x += fx;
      forces[fromIndex].y += fy;
      forces[toIndex].x -= fx;
      forces[toIndex].y -= fy;
    }

    for (let index = 0; index < seededNodes.length; index += 1) {
      const node = seededNodes[index];
      const centerX = WIDTH / 2 - node.x;
      const centerY = HEIGHT / 2 - node.y;
      forces[index].x += centerX * centerPull;
      forces[index].y += centerY * centerPull;

      node.vx = (node.vx + forces[index].x) * damping;
      node.vy = (node.vy + forces[index].y) * damping;
      node.x = clamp(node.x + node.vx, 34, WIDTH - 34);
      node.y = clamp(node.y + node.vy, 34, HEIGHT - 34);
    }
  }

  return { nodes: seededNodes, edges, totalNodes: nodes.length };
}


export default function GraphMap({ graph, onSelectNode }) {
  const deferredGraph = useDeferredValue(graph);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [maxNodes, setMaxNodes] = useState(180);
  const [localDepth, setLocalDepth] = useState(0);
  const [layout, setLayout] = useState({ nodes: [], edges: [], totalNodes: 0 });
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const [draggingNodeId, setDraggingNodeId] = useState("");
  const [pinnedNodeIds, setPinnedNodeIds] = useState(() => new Set());
  const [dragState, setDragState] = useState(null);
  const canvasRef = useRef(null);

  const sourceOptions = (deferredGraph?.nodes || [])
    .filter((node) => node.type === "source")
    .map((node) => node.name)
    .sort((a, b) => a.localeCompare(b));

  const filteredGraph = useMemo(() => {
    if (!deferredGraph?.nodes?.length) {
      return deferredGraph;
    }
    if (!selectedNodeId || localDepth <= 0) {
      return deferredGraph;
    }
    return localGraph(deferredGraph, selectedNodeId, localDepth);
  }, [deferredGraph, localDepth, selectedNodeId]);

  useEffect(() => {
    setLayout(buildLayout(filteredGraph, sourceFilter, maxNodes));
  }, [filteredGraph, sourceFilter, maxNodes]);

  useEffect(() => {
    if (!layout.nodes.length) {
      setSelectedNodeId("");
      return;
    }
    if (!layout.nodes.some((node) => node.id === selectedNodeId)) {
      const firstSource = layout.nodes.find((node) => node.type === "source");
      setSelectedNodeId(firstSource?.id || layout.nodes[0].id);
    }
  }, [layout, selectedNodeId]);

  const selectedNode = layout.nodes.find((node) => node.id === selectedNodeId) || null;

  function handleWheel(event) {
    event.preventDefault();
    const delta = event.deltaY < 0 ? 0.1 : -0.1;
    setViewport((current) => ({
      ...current,
      scale: clamp(Number((current.scale + delta).toFixed(2)), 0.45, 2.4),
    }));
  }

  function handleCanvasPointerDown(event) {
    if (event.target !== canvasRef.current) {
      return;
    }
    setDragState({
      kind: "canvas",
      startX: event.clientX,
      startY: event.clientY,
      originX: viewport.x,
      originY: viewport.y,
    });
  }

  function handleNodePointerDown(event, nodeId) {
    event.stopPropagation();
    setDraggingNodeId(nodeId);
  }

  function handlePointerMove(event) {
    if (dragState?.kind === "canvas") {
      const dx = event.clientX - dragState.startX;
      const dy = event.clientY - dragState.startY;
      setViewport((current) => ({
        ...current,
        x: dragState.originX + dx,
        y: dragState.originY + dy,
      }));
    }

    if (!draggingNodeId) {
      return;
    }
    const svg = canvasRef.current;
    if (!svg) {
      return;
    }
    const bounds = svg.getBoundingClientRect();
    const localX = ((event.clientX - bounds.left) / bounds.width) * WIDTH;
    const localY = ((event.clientY - bounds.top) / bounds.height) * HEIGHT;
    setLayout((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === draggingNodeId
          ? {
              ...node,
              x: clamp(localX / viewport.scale - viewport.x / viewport.scale, 30, WIDTH - 30),
              y: clamp(localY / viewport.scale - viewport.y / viewport.scale, 30, HEIGHT - 30),
            }
          : node,
      ),
    }));
  }

  function handlePointerUp() {
    if (draggingNodeId) {
      setPinnedNodeIds((current) => new Set(current).add(draggingNodeId));
    }
    setDraggingNodeId("");
    setDragState(null);
  }

  function togglePinned(nodeId) {
    setPinnedNodeIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
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
            max="320"
            step="10"
            value={maxNodes}
            onChange={(event) => setMaxNodes(Number(event.target.value))}
          />
          <div className="microcopy">
            Showing {layout.nodes.length} of {layout.totalNodes} nodes
          </div>
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
        <div className="graph-legend">
          <span><i className="legend-dot legend-dot--source" /> source</span>
          <span><i className="legend-dot legend-dot--note" /> markdown note</span>
          <span><i className="legend-dot legend-dot--file" /> other file</span>
        </div>
      </div>

      <div className="graph-grid">
        <div className="graph-canvas-shell">
          <svg
            ref={canvasRef}
            className="graph-canvas"
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role="img"
            aria-label="Vault graph"
            onWheel={handleWheel}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            <defs>
              <filter id="graphGlow">
                <feGaussianBlur stdDeviation="8" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}>
            {layout.edges.map((edge) => {
              const fromNode = layout.nodes.find((node) => node.id === edge.from);
              const toNode = layout.nodes.find((node) => node.id === edge.to);
              if (!fromNode || !toNode) {
                return null;
              }
              const isActive = edge.from === selectedNodeId || edge.to === selectedNodeId;
              return (
                <line
                  key={`${edge.type}-${edge.from}-${edge.to}`}
                  x1={fromNode.x}
                  y1={fromNode.y}
                  x2={toNode.x}
                  y2={toNode.y}
                  className={`graph-edge ${isActive ? "graph-edge--active" : ""}`}
                />
              );
            })}

            {layout.nodes.map((node) => {
              const active = node.id === selectedNodeId;
              const radius = node.type === "source" ? 10 : 5.5 + Math.min(node.degree, 5);
              const accent = nodeAccent(node);
              const pinned = pinnedNodeIds.has(node.id);
              return (
                <g
                  key={node.id}
                  className={`graph-node ${active ? "graph-node--active" : ""} ${pinned ? "graph-node--pinned" : ""}`}
                  onClick={() => {
                    setSelectedNodeId(node.id);
                    onSelectNode?.(node);
                  }}
                  onDoubleClick={() => togglePinned(node.id)}
                  onPointerDown={(event) => handleNodePointerDown(event, node.id)}
                >
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={radius + (active ? 4 : 0)}
                    fill={accent}
                    fillOpacity={active ? 0.22 : 0.14}
                    filter="url(#graphGlow)"
                  />
                  <circle cx={node.x} cy={node.y} r={radius} fill={accent} />
                  {(active || node.type === "source") ? (
                    <text x={node.x + radius + 8} y={node.y + 4} className="graph-label">
                      {pinned ? `• ${nodeLabel(node)}` : nodeLabel(node)}
                    </text>
                  ) : null}
                  <title>{nodeLabel(node)}</title>
                </g>
              );
            })}
            </g>
          </svg>
        </div>

        <aside className="graph-details">
          {selectedNode ? (
            <>
              <span className="eyebrow">Selected node</span>
              <h3>{nodeLabel(selectedNode)}</h3>
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
