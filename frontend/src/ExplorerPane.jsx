function TreeNode({ node, depth, expanded, onToggle, selectedId, onSelect }) {
  const isOpen = expanded.has(node.id);
  const isSelected = selectedId === node.id;

  if (node.kind === "file") {
    return (
      <button
        type="button"
        className={`tree-node tree-node--file ${isSelected ? "tree-node--selected" : ""}`}
        style={{ paddingLeft: `${16 + depth * 14}px` }}
        onClick={() => onSelect(node.file)}
      >
        <span>{node.name}</span>
      </button>
    );
  }

  return (
    <div className="tree-group">
      <button
        type="button"
        className={`tree-node tree-node--${node.kind}`}
        style={{ paddingLeft: `${12 + depth * 14}px` }}
        onClick={() => onToggle(node.id)}
      >
        <span>{isOpen ? "▾" : "▸"}</span>
        <span>{node.name}</span>
      </button>
      {isOpen
        ? node.children?.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))
        : null}
    </div>
  );
}


export default function ExplorerPane({
  tree,
  selectedId,
  expanded,
  onToggle,
  onSelect,
  onOpenQuickSwitcher,
}) {
  return (
    <section className="panel panel--tight">
      <div className="panel__header panel__header--spread">
        <div>
          <span className="eyebrow">Explorer</span>
          <h3>Workspace files</h3>
        </div>
        <button className="secondary-button" type="button" onClick={onOpenQuickSwitcher}>
          Quick switcher
        </button>
      </div>
      <div className="tree-scroll">
        {tree.length ? (
          tree.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              expanded={expanded}
              onToggle={onToggle}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))
        ) : (
          <p className="empty-copy">Run a preview or build to populate the explorer.</p>
        )}
      </div>
    </section>
  );
}
