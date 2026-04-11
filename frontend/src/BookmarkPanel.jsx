export default function BookmarkPanel({ bookmarks, onSelectBookmark }) {
  return (
    <div className="sidebar__panel">
      <span className="eyebrow">Bookmarks</span>
      <div className="sidebar-card-stack">
        {bookmarks.length ? (
          bookmarks.slice(0, 10).map((bookmark) => (
            <button
              key={bookmark.id}
              type="button"
              className="sidebar-card__main sidebar-card sidebar-card--static"
              onClick={() => onSelectBookmark(bookmark)}
            >
              <strong>{bookmark.label}</strong>
              <span>{bookmark.type}</span>
            </button>
          ))
        ) : (
          <p className="empty-copy">No bookmarks yet.</p>
        )}
      </div>
    </div>
  );
}
