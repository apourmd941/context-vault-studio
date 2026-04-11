function naturalCompare(left, right) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}


export function buildFileTree(files) {
  const tree = [];
  const sourceMap = new Map();

  for (const file of files || []) {
    const sourceName = file.source_name || file.source || "Uncategorized";
    let sourceNode = sourceMap.get(sourceName);
    if (!sourceNode) {
      sourceNode = {
        id: `source:${sourceName}`,
        kind: "source",
        name: sourceName,
        children: [],
      };
      sourceMap.set(sourceName, sourceNode);
      tree.push(sourceNode);
    }

    let pointer = sourceNode;
    const parts = (file.rel_path || "").split("/").filter(Boolean);
    parts.forEach((part, index) => {
      const isLeaf = index === parts.length - 1;
      if (isLeaf) {
        pointer.children.push({
          id: file.id,
          kind: "file",
          name: part,
          file,
        });
        return;
      }

      let next = pointer.children.find((child) => child.kind === "directory" && child.name === part);
      if (!next) {
        next = {
          id: `${pointer.id}/${part}`,
          kind: "directory",
          name: part,
          children: [],
        };
        pointer.children.push(next);
      }
      pointer = next;
    });
  }

  function sortNode(node) {
    if (!node.children) {
      return node;
    }
    node.children = node.children
      .map(sortNode)
      .sort((left, right) => {
        const kindRank = { directory: 0, file: 1 };
        return (kindRank[left.kind] ?? 2) - (kindRank[right.kind] ?? 2) || naturalCompare(left.name, right.name);
      });
    return node;
  }

  return tree.map(sortNode).sort((left, right) => naturalCompare(left.name, right.name));
}


export function searchFiles(files, query, limit = 30) {
  const raw = query.trim();
  const normalized = raw.toLowerCase();
  if (!normalized) {
    return [];
  }

  const tokens = raw.split(/\s+/).filter(Boolean);
  const filters = { source: "", ext: "", path: "", kind: "" };
  const textTokens = [];

  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (lower.startsWith("source:")) {
      filters.source = lower.slice("source:".length);
      continue;
    }
    if (lower.startsWith("ext:")) {
      filters.ext = lower.slice("ext:".length).replace(/^\./, "");
      continue;
    }
    if (lower.startsWith("path:")) {
      filters.path = lower.slice("path:".length);
      continue;
    }
    if (lower.startsWith("kind:")) {
      filters.kind = lower.slice("kind:".length);
      continue;
    }
    textTokens.push(lower);
  }

  return [...(files || [])]
    .map((file) => {
      if (filters.source && !(file.source_name || file.source || "").toLowerCase().includes(filters.source)) {
        return { file, score: 0 };
      }
      if (filters.ext && (file.extension || "").toLowerCase().replace(/^\./, "") !== filters.ext) {
        return { file, score: 0 };
      }
      if (filters.path && !(file.rel_path || "").toLowerCase().includes(filters.path)) {
        return { file, score: 0 };
      }
      if (filters.kind && !(file.kind || file.extension || "").toLowerCase().includes(filters.kind)) {
        return { file, score: 0 };
      }

      const haystack = [
        file.label,
        file.rel_path,
        file.source_name,
        file.summary,
        file.extension,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const textQuery = textTokens.join(" ").trim();
      const score =
        textQuery && (file.label || "").toLowerCase().startsWith(textQuery)
          ? 6
          : textQuery && haystack.includes(textQuery)
            ? 3
            : textTokens.length === 0
              ? 1
              : 0;
      return { file, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || naturalCompare(left.file.rel_path, right.file.rel_path))
    .slice(0, limit)
    .map((item) => item.file);
}


export function buildAdjacency(graph) {
  const outgoing = new Map();
  const incoming = new Map();

  for (const edge of graph?.edges || []) {
    if (!outgoing.has(edge.from)) {
      outgoing.set(edge.from, []);
    }
    if (!incoming.has(edge.to)) {
      incoming.set(edge.to, []);
    }
    outgoing.get(edge.from).push(edge.to);
    incoming.get(edge.to).push(edge.from);
  }

  return { outgoing, incoming };
}


export function localGraph(graph, centerId, depth) {
  if (!centerId || !depth || depth < 0) {
    return graph;
  }

  const adjacency = buildAdjacency(graph);
  const visited = new Set([centerId]);
  let frontier = new Set([centerId]);

  for (let level = 0; level < depth; level += 1) {
    const nextFrontier = new Set();
    for (const nodeId of frontier) {
      for (const target of adjacency.outgoing.get(nodeId) || []) {
        if (!visited.has(target)) {
          visited.add(target);
          nextFrontier.add(target);
        }
      }
      for (const source of adjacency.incoming.get(nodeId) || []) {
        if (!visited.has(source)) {
          visited.add(source);
          nextFrontier.add(source);
        }
      }
    }
    frontier = nextFrontier;
  }

  return {
    nodes: (graph?.nodes || []).filter((node) => visited.has(node.id)),
    edges: (graph?.edges || []).filter((edge) => visited.has(edge.from) && visited.has(edge.to)),
  };
}
