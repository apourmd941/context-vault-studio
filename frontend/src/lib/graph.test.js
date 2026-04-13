import { describe, expect, it } from "vitest";

import { graphNodeLabel, searchGraphNodes, selectVisibleGraph } from "./graph";


describe("graph helpers", () => {
  it("searches across indexed graph nodes by path and label", () => {
    const graph = {
      nodes: [
        { id: "source:demo", type: "source", name: "demo" },
        { id: "file:demo:README.md", type: "file", label: "README.md", rel_path: "README.md", source: "demo" },
        { id: "file:demo:docs/spec.md", type: "file", label: "spec.md", rel_path: "docs/spec.md", source: "demo" },
      ],
      edges: [],
    };

    const results = searchGraphNodes(graph, "docs/spec");

    expect(results.map((node) => node.id)).toEqual(["file:demo:docs/spec.md"]);
    expect(graphNodeLabel(results[0])).toBe("spec.md");
  });

  it("keeps the selected node visible even when the graph is capped", () => {
    const graph = {
      nodes: [
        { id: "source:demo", type: "source", name: "demo" },
        { id: "file:a", type: "file", label: "a.md", rel_path: "a.md", source: "demo" },
        { id: "file:b", type: "file", label: "b.md", rel_path: "b.md", source: "demo" },
        { id: "file:c", type: "file", label: "c.md", rel_path: "c.md", source: "demo" },
        { id: "file:d", type: "file", label: "d.md", rel_path: "d.md", source: "demo" },
        { id: "file:hidden", type: "file", label: "hidden.md", rel_path: "archive/hidden.md", source: "demo" },
      ],
      edges: [
        { from: "source:demo", to: "file:a" },
        { from: "source:demo", to: "file:b" },
        { from: "source:demo", to: "file:c" },
        { from: "source:demo", to: "file:d" },
        { from: "source:demo", to: "file:hidden" },
        { from: "file:a", to: "file:b" },
        { from: "file:b", to: "file:c" },
        { from: "file:c", to: "file:d" },
      ],
    };

    const visible = selectVisibleGraph(graph, {
      maxNodes: 4,
      selectedNodeId: "file:hidden",
    });

    expect(visible.totalNodes).toBe(6);
    expect(visible.nodes.map((node) => node.id)).toContain("file:hidden");
  });
});
