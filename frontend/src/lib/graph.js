function naturalCompare(left, right) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}


const TYPE_METADATA = [
  { id: "source", label: "source", accent: "#7ce6d3" },
  { id: "markdown-note", label: "markdown note", accent: "#9b8cff" },
  { id: "other-file", label: "other file", accent: "#f6c177" },
];


export function graphNodeLabel(node) {
  return node?.name || node?.label || node?.rel_path || node?.id || "Unknown node";
}


export function graphNodeTypeKey(node) {
  if (node?.type === "source") {
    return "source";
  }
  if ((node?.extension || "").toLowerCase() === ".md") {
    return "markdown-note";
  }
  return "other-file";
}


export function graphNodeFolderKey(node) {
  if (!node?.rel_path) {
    return null;
  }

  const parts = node.rel_path.split("/").filter(Boolean);
  if (parts.length <= 1) {
    return "folder:__root__";
  }

  return `folder:${parts[0].toLowerCase()}`;
}


export function graphNodeFolderLabel(node) {
  if (!node?.rel_path) {
    return null;
  }

  const parts = node.rel_path.split("/").filter(Boolean);
  if (parts.length <= 1) {
    return "Root files";
  }

  return parts[0];
}


export function buildGraphFocusOptions(graph) {
  const typeCounts = new Map(TYPE_METADATA.map((item) => [item.id, 0]));
  const folderCounts = new Map();

  for (const node of graph?.nodes || []) {
    const typeKey = graphNodeTypeKey(node);
    typeCounts.set(typeKey, (typeCounts.get(typeKey) || 0) + 1);

    if (node.type === "source") {
      continue;
    }

    const folderKey = graphNodeFolderKey(node);
    const folderLabel = graphNodeFolderLabel(node);
    if (!folderKey || !folderLabel) {
      continue;
    }

    const existing = folderCounts.get(folderKey) || {
      id: folderKey,
      label: folderLabel,
      count: 0,
      kind: "folder",
      accent: "rgba(190, 196, 224, 0.88)",
    };
    existing.count += 1;
    folderCounts.set(folderKey, existing);
  }

  const typeOptions = TYPE_METADATA
    .map((item) => ({
      ...item,
      count: typeCounts.get(item.id) || 0,
      kind: "type",
    }))
    .filter((item) => item.count > 0);

  const folderOptions = [...folderCounts.values()].sort(
    (left, right) => right.count - left.count || naturalCompare(left.label, right.label),
  );

  return { typeOptions, folderOptions };
}


export function filterGraphByFocus(graph, { activeChipIds = [] } = {}) {
  const activeIds = activeChipIds instanceof Set ? activeChipIds : new Set(activeChipIds);
  if (!activeIds.size || !graph?.nodes?.length) {
    return graph;
  }

  const nodeLookup = new Map((graph.nodes || []).map((node) => [node.id, node]));
  const visibleIds = new Set();
  const visibleFileIds = new Set();

  for (const node of graph.nodes || []) {
    const typeKey = graphNodeTypeKey(node);
    const folderKey = graphNodeFolderKey(node);
    const matchesType = activeIds.has(typeKey);
    const matchesFolder = folderKey ? activeIds.has(folderKey) : false;

    if (node.type === "source") {
      if (matchesType) {
        visibleIds.add(node.id);
      }
      continue;
    }

    if (matchesType || matchesFolder) {
      visibleIds.add(node.id);
      visibleFileIds.add(node.id);
    }
  }

  if (visibleFileIds.size > 0) {
    for (const edge of graph.edges || []) {
      if (visibleFileIds.has(edge.from)) {
        const candidate = nodeLookup.get(edge.to);
        if (candidate?.type === "source") {
          visibleIds.add(edge.to);
        }
      }
      if (visibleFileIds.has(edge.to)) {
        const candidate = nodeLookup.get(edge.from);
        if (candidate?.type === "source") {
          visibleIds.add(edge.from);
        }
      }
    }
  }

  return {
    nodes: (graph.nodes || []).filter((node) => visibleIds.has(node.id)),
    edges: (graph.edges || []).filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to)),
  };
}


export function searchGraphNodes(graph, query, limit = 8) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  const tokens = normalized.split(/\s+/).filter(Boolean);

  return [...(graph?.nodes || [])]
    .map((node) => {
      const label = graphNodeLabel(node).toLowerCase();
      const relPath = (node.rel_path || "").toLowerCase();
      const source = (node.source || node.name || "").toLowerCase();
      const haystack = [
        label,
        relPath,
        node.path,
        source,
        node.type,
        node.extension,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      let score = 0;
      if (label === normalized || relPath === normalized) {
        score += 12;
      }
      if (label.startsWith(normalized)) {
        score += 8;
      }
      if (relPath.includes(normalized)) {
        score += 7;
      }
      if (source.includes(normalized)) {
        score += 4;
      }
      if (haystack.includes(normalized)) {
        score += 3;
      }
      if (tokens.length && tokens.every((token) => haystack.includes(token))) {
        score += 2;
      }

      return { node, score };
    })
    .filter((item) => item.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        naturalCompare(graphNodeLabel(left.node), graphNodeLabel(right.node)),
    )
    .slice(0, limit)
    .map((item) => item.node);
}


export function selectVisibleGraph(
  graph,
  { sourceFilter = "all", maxNodes = 180, selectedNodeId = "" } = {},
) {
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
    .sort((a, b) => graphNodeLabel(a).localeCompare(graphNodeLabel(b)));
  const fileNodes = nodes
    .filter((node) => node.type !== "source")
    .sort(
      (a, b) =>
        (degrees.get(b.id) || 0) - (degrees.get(a.id) || 0) ||
        graphNodeLabel(a).localeCompare(graphNodeLabel(b)),
    );

  const orderedNodes = [...sourceNodes, ...fileNodes];
  const nodeLookup = new Map(orderedNodes.map((node) => [node.id, node]));
  const neighborIds = [];
  if (selectedNodeId && visibleIds.has(selectedNodeId)) {
    for (const edge of edges) {
      if (edge.from === selectedNodeId && visibleIds.has(edge.to)) {
        neighborIds.push(edge.to);
      }
      if (edge.to === selectedNodeId && visibleIds.has(edge.from)) {
        neighborIds.push(edge.from);
      }
    }
  }

  const selectedNeighborIds = [...new Set(neighborIds)]
    .sort((left, right) => {
      const rightDegree = degrees.get(right) || 0;
      const leftDegree = degrees.get(left) || 0;
      if (rightDegree !== leftDegree) {
        return rightDegree - leftDegree;
      }
      const leftNode = nodeLookup.get(left);
      const rightNode = nodeLookup.get(right);
      return naturalCompare(graphNodeLabel(leftNode), graphNodeLabel(rightNode));
    })
    .slice(0, 24);

  const priorityIds = new Set(
    selectedNodeId && visibleIds.has(selectedNodeId)
      ? [selectedNodeId, ...selectedNeighborIds]
      : [],
  );

  const prioritizedNodes = orderedNodes.filter((node) => priorityIds.has(node.id));
  const remainingNodes = orderedNodes.filter((node) => !priorityIds.has(node.id));
  const cap = Math.max(18, Math.min(maxNodes, nodes.length));
  const cappedNodes = [...prioritizedNodes, ...remainingNodes].slice(0, cap);

  const cappedIds = new Set(cappedNodes.map((node) => node.id));
  edges = edges.filter((edge) => cappedIds.has(edge.from) && cappedIds.has(edge.to));

  const finalDegrees = new Map(cappedNodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    finalDegrees.set(edge.from, (finalDegrees.get(edge.from) || 0) + 1);
    finalDegrees.set(edge.to, (finalDegrees.get(edge.to) || 0) + 1);
  }

  return {
    nodes: cappedNodes.map((node) => ({
      ...node,
      degree: finalDegrees.get(node.id) || 0,
    })),
    edges,
    totalNodes: nodes.length,
  };
}
