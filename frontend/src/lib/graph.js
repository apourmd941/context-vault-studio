function naturalCompare(left, right) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}


export function graphNodeLabel(node) {
  return node?.name || node?.label || node?.rel_path || node?.id || "Unknown node";
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
