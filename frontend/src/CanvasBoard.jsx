import { useEffect, useMemo, useState } from "react";


function cardColor(color) {
  const palette = {
    violet: "rgba(155, 140, 255, 0.18)",
    mint: "rgba(124, 230, 211, 0.18)",
    amber: "rgba(246, 193, 119, 0.18)",
    rose: "rgba(255, 143, 143, 0.18)",
  };
  return palette[color] || palette.violet;
}


export default function CanvasBoard({
  canvases,
  selectedCanvasId,
  onSelectCanvas,
  onCreateCanvas,
  onSaveCanvas,
  onAddFileCard,
  onAddTextCard,
  selectedFile,
}) {
  const selectedCanvas = useMemo(
    () => canvases.find((canvas) => canvas.id === selectedCanvasId) || canvases[0] || null,
    [canvases, selectedCanvasId],
  );
  const [cards, setCards] = useState([]);
  const [dragId, setDragId] = useState("");

  useEffect(() => {
    setCards(selectedCanvas?.cards || []);
  }, [selectedCanvas]);

  function startDrag(event, cardId) {
    event.preventDefault();
    setDragId(cardId);
  }

  function onMove(event) {
    if (!dragId) {
      return;
    }
    const board = event.currentTarget.getBoundingClientRect();
    setCards((current) =>
      current.map((card) =>
        card.id === dragId
          ? {
              ...card,
              x: Math.max(12, event.clientX - board.left - card.width / 2),
              y: Math.max(12, event.clientY - board.top - 24),
            }
          : card,
      ),
    );
  }

  function onUp() {
    setDragId("");
  }

  return (
    <section className="panel">
      <div className="panel__header panel__header--spread">
        <div>
          <span className="eyebrow">Canvas</span>
          <h3>Board view</h3>
        </div>
        <div className="hero__actions hero__actions--tight">
          <button className="secondary-button" type="button" onClick={onCreateCanvas}>
            New canvas
          </button>
          <button className="secondary-button" type="button" onClick={() => onAddTextCard(selectedCanvas)}>
            Add text card
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => onAddFileCard(selectedCanvas, selectedFile)}
            disabled={!selectedFile}
          >
            Add selected file
          </button>
          <button className="ghost-button" type="button" onClick={() => onSaveCanvas(selectedCanvas, cards)}>
            Save board
          </button>
        </div>
      </div>

      <div className="canvas-tabs">
        {canvases.map((canvas) => (
          <button
            key={canvas.id}
            className={`canvas-tab ${selectedCanvas?.id === canvas.id ? "canvas-tab--active" : ""}`}
            type="button"
            onClick={() => onSelectCanvas(canvas.id)}
          >
            {canvas.name}
          </button>
        ))}
      </div>

      <div className="canvas-board" onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
        {cards.map((card) => (
          <article
            key={card.id}
            className="canvas-card"
            style={{
              left: `${card.x}px`,
              top: `${card.y}px`,
              width: `${card.width}px`,
              minHeight: `${card.height}px`,
              background: cardColor(card.color),
            }}
          >
            <button className="canvas-card__handle" type="button" onPointerDown={(event) => startDrag(event, card.id)}>
              Drag
            </button>
            <h4>{card.label}</h4>
            {card.type === "file" ? <p>{card.path}</p> : <p>{card.text || "Text card"}</p>}
          </article>
        ))}
        {!cards.length ? (
          <div className="canvas-empty">
            <h3>No cards yet</h3>
            <p>Add text cards or selected files to start building a board.</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
