function TreeNode({ node, depth, expanded, onToggle, selectedId, onSelect, onDragFileStart, onSendToCanvas }) {
  const isOpen = expanded.has(node.id);
  const isSelected = selectedId === node.id;

  if (node.kind === "file") {
    return (
      <div className={`tree-node-row ${isSelected ? "tree-node-row--selected" : ""}`}>
        <button
          type="button"
          className={`tree-node tree-node--file ${isSelected ? "tree-node--selected" : ""}`}
          style={{ paddingLeft: `${16 + depth * 14}px` }}
          onClick={() => onSelect(node.file)}
          draggable
          onDragStart={(event) => onDragFileStart?.(event, node.file)}
        >
          <span>{node.name}</span>
        </button>
        <button className="ghost-button tree-node-action" type="button" onClick={() => onSendToCanvas?.(node.file)}>
          To canvas
        </button>
      </div>
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
            onDragFileStart={onDragFileStart}
            onSendToCanvas={onSendToCanvas}
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
  filters,
  activeFilter,
  onFilterChange,
  onDragFileStart,
  onSendToCanvas,
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
      {filters?.length ? (
        <div className="explorer-filter-row">
          {filters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={`canvas-tab ${activeFilter === filter.id ? "canvas-tab--active" : ""}`}
              onClick={() => onFilterChange?.(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      ) : null}
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
              onDragFileStart={onDragFileStart}
              onSendToCanvas={onSendToCanvas}
            />
          ))
        ) : (
          <p className="empty-copy">Run a preview or build to populate the explorer.</p>
        )}
      </div>
    </section>
  );
}
