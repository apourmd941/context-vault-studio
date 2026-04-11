export default function PresetPanel({
  presets,
  buildHistory,
  jobs,
  onLoadPreset,
  onSavePreset,
  onDeletePreset,
}) {
  return (
    <>
      <div className="sidebar__panel">
        <div className="panel__header panel__header--spread">
          <div>
            <span className="eyebrow">Presets</span>
            <h3>Saved layouts</h3>
          </div>
          <button className="secondary-button" type="button" onClick={onSavePreset}>
            Save preset
          </button>
        </div>
        <div className="sidebar-card-stack">
          {presets.length ? (
            presets.map((preset) => (
              <div key={preset.id} className="sidebar-card">
                <button type="button" className="sidebar-card__main" onClick={() => onLoadPreset(preset)}>
                  <strong>{preset.name}</strong>
                  <span>{preset.description || "No description"}</span>
                </button>
                <button type="button" className="ghost-button" onClick={() => onDeletePreset(preset.id)}>
                  Remove
                </button>
              </div>
            ))
          ) : (
            <p className="empty-copy">No presets saved yet.</p>
          )}
        </div>
      </div>

      <div className="sidebar__panel">
        <span className="eyebrow">Jobs</span>
        <div className="sidebar-card-stack">
          {jobs.length ? (
            jobs.slice(0, 5).map((job) => (
              <div key={job.id} className="sidebar-card sidebar-card--static">
                <strong>{job.kind}</strong>
                <span>{job.message}</span>
                <em>{job.status}</em>
              </div>
            ))
          ) : (
            <p className="empty-copy">No jobs yet.</p>
          )}
        </div>
      </div>

      <div className="sidebar__panel">
        <span className="eyebrow">Build history</span>
        <div className="sidebar-card-stack">
          {buildHistory.length ? (
            buildHistory.slice(0, 5).map((entry) => (
              <div key={entry.id} className="sidebar-card sidebar-card--static">
                <strong>{entry.summary?.vault_name || "Vault build"}</strong>
                <span>{entry.summary?.file_count || 0} files</span>
                <em>{entry.created_at}</em>
              </div>
            ))
          ) : (
            <p className="empty-copy">No build history yet.</p>
          )}
        </div>
      </div>
    </>
  );
}
