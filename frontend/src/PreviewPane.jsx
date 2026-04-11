import ReactMarkdown from "react-markdown";
import { useEffect, useState } from "react";


function LinkList({ title, items, onSelect }) {
  return (
    <div className="link-list">
      <span className="eyebrow">{title}</span>
      {items.length ? (
        <div className="link-chip-grid">
          {items.map((item) => (
            <button key={item.id} type="button" className="link-chip" onClick={() => onSelect(item)}>
              {item.label}
            </button>
          ))}
        </div>
      ) : (
        <p className="empty-copy">None</p>
      )}
    </div>
  );
}


export default function PreviewPane({
  selectedFile,
  preview,
  busy,
  onSelectLinkedFile,
  backlinks,
  outgoing,
  onSaveFile,
  onBookmarkFile,
}) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setDraft(preview?.content || "");
    setEditing(false);
  }, [preview?.content, selectedFile?.id]);

  return (
    <section className="panel panel--tight">
      <div className="panel__header">
        <div>
          <span className="eyebrow">Preview</span>
          <h3>{selectedFile?.label || "Choose a file"}</h3>
          <div className="microcopy">{selectedFile?.rel_path || "Select something in the explorer or graph."}</div>
        </div>
        {selectedFile ? (
          <div className="hero__actions hero__actions--tight">
            <button className="secondary-button" type="button" onClick={() => onBookmarkFile(selectedFile)}>
              Bookmark
            </button>
            {preview?.kind === "text" ? (
              <button className="ghost-button" type="button" onClick={() => setEditing((current) => !current)}>
                {editing ? "Preview" : "Edit"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {!selectedFile ? (
        <div className="empty-state">
          <h3>No file selected</h3>
          <p>Pick a note, image, or document to see a richer preview with links and metadata.</p>
        </div>
      ) : busy ? (
        <div className="callout">Loading preview…</div>
      ) : preview ? (
        <div className="preview-stack">
          <div className="preview-meta">
            <span>{preview.kind}</span>
            <span>{preview.mime_type}</span>
            <span>{preview.size_bytes} bytes</span>
          </div>

          {preview.kind === "text" && editing ? (
            <div className="editor-surface">
              <textarea value={draft} rows="18" onChange={(event) => setDraft(event.target.value)} />
              <div className="hero__actions hero__actions--tight">
                <button className="primary-button" type="button" onClick={() => onSaveFile(selectedFile, draft)}>
                  Save note
                </button>
                <button className="ghost-button" type="button" onClick={() => setDraft(preview.content || "")}>
                  Reset
                </button>
              </div>
            </div>
          ) : null}

          {preview.kind === "text" && !editing ? (
            <div className="markdown-surface">
              <ReactMarkdown>{preview.content || ""}</ReactMarkdown>
            </div>
          ) : null}

          {preview.kind === "image" ? (
            <div className="media-surface">
              <img src={preview.media_url} alt={preview.name} />
            </div>
          ) : null}

          {preview.kind === "pdf" ? (
            <div className="media-surface media-surface--pdf">
              <iframe title={preview.name} src={preview.media_url} />
            </div>
          ) : null}

          {preview.kind === "binary" ? (
            <div className="callout">Binary file preview is not rendered inline yet.</div>
          ) : null}

          <div className="preview-sidecar">
            <LinkList title="Outgoing links" items={outgoing} onSelect={onSelectLinkedFile} />
            <LinkList title="Backlinks" items={backlinks} onSelect={onSelectLinkedFile} />
            <div className="link-list">
              <span className="eyebrow">Headings</span>
              {preview.headings?.length ? (
                <ul className="compact-list compact-list--tight">
                  {preview.headings.map((heading, index) => (
                    <li key={`${heading.text}-${index}`}>
                      <strong>{"#".repeat(heading.level)}</strong>
                      <span>{heading.text}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-copy">No headings detected.</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <p className="empty-copy">Preview unavailable.</p>
      )}
    </section>
  );
}
