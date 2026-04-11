import { describe, expect, it } from "vitest";

import { buildFileTree, localGraph, searchFiles } from "./vault";


describe("vault helpers", () => {
  it("builds a grouped tree from source files", () => {
    const tree = buildFileTree([
      {
        id: "file:demo:README.md",
        source_name: "demo",
        rel_path: "README.md",
        label: "README.md",
      },
      {
        id: "file:demo:docs/spec.md",
        source_name: "demo",
        rel_path: "docs/spec.md",
        label: "spec.md",
      },
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0].children[0].kind).toBe("directory");
    expect(tree[0].children[1].kind).toBe("file");
  });

  it("searches files by label and path", () => {
    const results = searchFiles(
      [
        { id: "1", label: "README.md", rel_path: "README.md", source_name: "demo", summary: "Intro" },
        { id: "2", label: "Graph.md", rel_path: "notes/Graph.md", source_name: "demo", summary: "Map" },
      ],
      "graph",
    );
    expect(results.map((item) => item.id)).toEqual(["2"]);
  });

  it("reduces a graph to a local neighborhood", () => {
    const graph = {
      nodes: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "c", to: "d" },
      ],
    };
    const result = localGraph(graph, "b", 1);
    expect(result.nodes.map((node) => node.id).sort()).toEqual(["a", "b", "c"]);
  });
});
