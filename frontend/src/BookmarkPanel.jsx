export default function BookmarkPanel({ bookmarks, onSelectBookmark }) {
  if (!bookmarks.length) {
    return null;
  }

  return (
    <div className="sidebar__panel">
      <span className="eyebrow">Bookmarks</span>
      <div className="sidebar-card-stack">
        {bookmarks.slice(0, 10).map((bookmark) => (
          <button
            key={bookmark.id}
            type="button"
            className="sidebar-card__main sidebar-card sidebar-card--static"
            onClick={() => onSelectBookmark(bookmark)}
          >
            <strong>{bookmark.label}</strong>
            <span>{bookmark.type}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
