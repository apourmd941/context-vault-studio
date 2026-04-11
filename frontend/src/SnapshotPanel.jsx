export default function SnapshotPanel({ snapshots, onRestore }) {
  return (
    <div className="sidebar__panel">
      <span className="eyebrow">Snapshots</span>
      <div className="sidebar-card-stack">
        {snapshots.length ? (
          snapshots.slice(0, 8).map((snapshot) => (
            <div key={snapshot.id} className="sidebar-card">
              <div className="sidebar-card__main">
                <strong>{snapshot.label || snapshot.kind}</strong>
                <span>{snapshot.created_at}</span>
              </div>
              <button className="ghost-button" type="button" onClick={() => onRestore(snapshot.id)}>
                Restore
              </button>
            </div>
          ))
        ) : (
          <p className="empty-copy">No snapshots yet.</p>
        )}
      </div>
    </div>
  );
}
