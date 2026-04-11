export default function QuickSwitcher({ open, query, results, onClose, onQueryChange, onSelect }) {
  if (!open) {
    return null;
  }

  return (
    <div className="overlay-shell" onClick={onClose}>
      <div className="quick-switcher" onClick={(event) => event.stopPropagation()}>
        <div className="quick-switcher__header">
          <span className="eyebrow">Quick switcher</span>
          <button className="ghost-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <input
          autoFocus
          className="quick-switcher__input"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search notes, files, and paths..."
        />
        <div className="quick-switcher__results">
          {results.length ? (
            results.map((file) => (
              <button
                key={file.id}
                className="quick-result"
                type="button"
                onClick={() => onSelect(file)}
              >
                <strong>{file.label}</strong>
                <span>{file.rel_path}</span>
                <em>{file.source_name || file.source}</em>
              </button>
            ))
          ) : (
            <p className="empty-copy">No matching files in the current workspace.</p>
          )}
        </div>
      </div>
    </div>
  );
}
