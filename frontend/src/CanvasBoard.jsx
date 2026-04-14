import { useEffect, useMemo, useRef, useState } from "react";

import { normalizeCanvasMetadata } from "./lib/canvas";


const SURFACE_WIDTH = 2600;
const SURFACE_HEIGHT = 1800;
const MIN_ZOOM = 0.42;
const MAX_ZOOM = 1.9;
const GRID_SIZE = 20;
const SNAP_DISTANCE = 14;

const COLOR_META = {
  violet: {
    fill: "rgba(155, 140, 255, 0.18)",
    border: "rgba(155, 140, 255, 0.46)",
    line: "rgba(155, 140, 255, 0.62)",
  },
  mint: {
    fill: "rgba(124, 230, 211, 0.18)",
    border: "rgba(124, 230, 211, 0.46)",
    line: "rgba(124, 230, 211, 0.72)",
  },
  amber: {
    fill: "rgba(246, 193, 119, 0.18)",
    border: "rgba(246, 193, 119, 0.46)",
    line: "rgba(246, 193, 119, 0.7)",
  },
  rose: {
    fill: "rgba(255, 143, 143, 0.18)",
    border: "rgba(255, 143, 143, 0.44)",
    line: "rgba(255, 143, 143, 0.7)",
  },
  slate: {
    fill: "rgba(149, 163, 184, 0.16)",
    border: "rgba(149, 163, 184, 0.42)",
    line: "rgba(149, 163, 184, 0.64)",
  },
};

const CANVAS_TEMPLATES = [
  { id: "architecture-review", label: "Architecture review", category: "Architecture", lane: "structure" },
  { id: "build-plan", label: "Build plan", category: "Build", lane: "structure" },
  { id: "research-synthesis", label: "Research synthesis", category: "Research", lane: "digital-brain" },
];


function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}


function colorMeta(color) {
  return COLOR_META[color] || COLOR_META.violet;
}


function normalizeViewport(viewport = {}) {
  return {
    x: Number(viewport.x ?? 40),
    y: Number(viewport.y ?? 40),
    zoom: clamp(Number(viewport.zoom ?? 0.88), MIN_ZOOM, MAX_ZOOM),
  };
}


function normalizeCard(card = {}) {
  return {
    id: card.id,
    type: card.type || "text",
    label: card.label || "Untitled card",
    path: card.path || null,
    file_id: card.file_id || null,
    text: card.text || "",
    note: card.note || "",
    x: Number(card.x ?? 40),
    y: Number(card.y ?? 40),
    width: Number(card.width ?? (card.type === "group" ? 440 : 300)),
    height: Number(card.height ?? (card.type === "group" ? 260 : 210)),
    color: card.color || (card.type === "file" ? "violet" : card.type === "group" ? "amber" : "mint"),
    locked: Boolean(card.locked),
  };
}


function normalizeEdge(edge = {}) {
  return {
    id: edge.id,
    from_card: edge.from_card,
    to_card: edge.to_card,
    label: edge.label || "",
    color: edge.color || "mint",
  };
}


function normalizeCanvas(canvas) {
  if (!canvas) {
    return null;
  }
  return {
    ...canvas,
    description: canvas.description || "",
    cards: (canvas.cards || []).map(normalizeCard),
    edges: (canvas.edges || []).map(normalizeEdge),
    viewport: normalizeViewport(canvas.viewport),
    metadata: normalizeCanvasMetadata(canvas.metadata),
  };
}


function boardPoint(stageRect, viewport, clientX, clientY) {
  return {
    x: (clientX - stageRect.left - viewport.x) / viewport.zoom,
    y: (clientY - stageRect.top - viewport.y) / viewport.zoom,
  };
}


function fitViewport(cards, stageRect) {
  if (!stageRect) {
    return normalizeViewport();
  }
  if (!cards.length) {
    return {
      x: Math.round(stageRect.width * 0.12),
      y: Math.round(stageRect.height * 0.1),
      zoom: 0.82,
    };
  }

  const minX = Math.min(...cards.map((card) => card.x));
  const minY = Math.min(...cards.map((card) => card.y));
  const maxX = Math.max(...cards.map((card) => card.x + card.width));
  const maxY = Math.max(...cards.map((card) => card.y + card.height));
  const boundsWidth = Math.max(320, maxX - minX);
  const boundsHeight = Math.max(240, maxY - minY);
  const padding = 110;
  const zoom = clamp(
    Math.min((stageRect.width - padding) / boundsWidth, (stageRect.height - padding) / boundsHeight, 1),
    MIN_ZOOM,
    MAX_ZOOM,
  );

  return {
    x: Math.round((stageRect.width - boundsWidth * zoom) / 2 - minX * zoom),
    y: Math.round((stageRect.height - boundsHeight * zoom) / 2 - minY * zoom),
    zoom,
  };
}


function cardCenter(card) {
  return {
    x: card.x + card.width / 2,
    y: card.y + card.height / 2,
  };
}


function cardPreview(card) {
  if (card.type === "group") {
    return card.note || "Use group cards to cluster files, notes, and open questions.";
  }
  if (card.type === "file") {
    return card.note || card.text || card.path || "File card";
  }
  return card.text || card.note || "Text card";
}


function unique(values) {
  return [...new Set(values)];
}


function boundsForCards(cards) {
  if (!cards.length) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const minX = Math.min(...cards.map((card) => card.x));
  const minY = Math.min(...cards.map((card) => card.y));
  const maxX = Math.max(...cards.map((card) => card.x + card.width));
  const maxY = Math.max(...cards.map((card) => card.y + card.height));
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}


function collectSnapTargets(cards, excludedIds) {
  const excluded = new Set(excludedIds);
  const x = [];
  const y = [];
  for (const card of cards) {
    if (excluded.has(card.id)) {
      continue;
    }
    x.push(card.x, card.x + card.width / 2, card.x + card.width);
    y.push(card.y, card.y + card.height / 2, card.y + card.height);
  }
  return { x, y };
}


function bestSnapForAxis(candidates, targets) {
  let best = null;
  for (const candidate of candidates) {
    for (const target of targets) {
      const distance = Math.abs(target - candidate.value);
      if (distance <= SNAP_DISTANCE && (!best || distance < best.distance)) {
        best = { distance, delta: target - candidate.value, guide: candidate.guide(target) };
      }
    }
    const gridTarget = Math.round(candidate.value / GRID_SIZE) * GRID_SIZE;
    const gridDistance = Math.abs(gridTarget - candidate.value);
    if (gridDistance <= SNAP_DISTANCE && (!best || gridDistance < best.distance)) {
      best = { distance: gridDistance, delta: gridTarget - candidate.value, guide: candidate.guide(gridTarget) };
    }
  }
  return best;
}


function applyRectSnapping(rect, targets) {
  const xCandidates = [
    { value: rect.x, guide: (target) => ({ orientation: "vertical", position: target }) },
    { value: rect.x + rect.width / 2, guide: (target) => ({ orientation: "vertical", position: target }) },
    { value: rect.x + rect.width, guide: (target) => ({ orientation: "vertical", position: target }) },
  ];
  const yCandidates = [
    { value: rect.y, guide: (target) => ({ orientation: "horizontal", position: target }) },
    { value: rect.y + rect.height / 2, guide: (target) => ({ orientation: "horizontal", position: target }) },
    { value: rect.y + rect.height, guide: (target) => ({ orientation: "horizontal", position: target }) },
  ];

  const xSnap = bestSnapForAxis(xCandidates, targets.x);
  const ySnap = bestSnapForAxis(yCandidates, targets.y);

  return {
    x: rect.x + (xSnap?.delta || 0),
    y: rect.y + (ySnap?.delta || 0),
    guides: [xSnap?.guide, ySnap?.guide].filter(Boolean),
  };
}


function clampCard(card) {
  return {
    ...card,
    x: clamp(card.x, 16, SURFACE_WIDTH - card.width - 16),
    y: clamp(card.y, 16, SURFACE_HEIGHT - card.height - 16),
  };
}


function anchorForCard(card, dx, dy) {
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { x: card.x + card.width, y: card.y + card.height / 2 }
      : { x: card.x, y: card.y + card.height / 2 };
  }
  return dy >= 0
    ? { x: card.x + card.width / 2, y: card.y + card.height }
    : { x: card.x + card.width / 2, y: card.y };
}


function collectScopeDetails(cards, selectedCards, edges, fileLookup, files) {
  const fileCards = (cards || []).filter((card) => card.type === "file");
  const activeCards = selectedCards?.length ? selectedCards : cards || [];
  const resolveRelPath = (card) => {
    const file =
      (card?.file_id ? fileLookup.get(card.file_id) : null) ||
      files.find((item) => item.original_path === card?.path) ||
      null;
    return file?.rel_path || null;
  };

  const allBoardFiles = unique(fileCards.map(resolveRelPath).filter(Boolean));

  if (!selectedCards?.length) {
    return {
      selected_files: allBoardFiles,
      direct_files: allBoardFiles,
      group_files: [],
      linked_files: [],
      selected_card_ids: activeCards.map((card) => card.id),
      selected_card_labels: activeCards.map((card) => card.label),
      note_card_count: activeCards.filter((card) => card.type === "text").length,
      group_card_count: activeCards.filter((card) => card.type === "group").length,
      link_count: (edges || []).length,
      why_summary: allBoardFiles.length
        ? "Using the full board because no narrower selection is active."
        : "No file cards are on the board yet.",
    };
  }

  const directFiles = unique(
    selectedCards
      .filter((card) => card.type === "file")
      .map(resolveRelPath)
      .filter(Boolean),
  );

  const groupFiles = unique(
    selectedCards
      .filter((card) => card.type === "group")
      .flatMap((group) =>
        fileCards
          .filter((card) => {
            const centerX = card.x + card.width / 2;
            const centerY = card.y + card.height / 2;
            return (
              centerX >= group.x &&
              centerX <= group.x + group.width &&
              centerY >= group.y &&
              centerY <= group.y + group.height
            );
          })
          .map(resolveRelPath)
          .filter(Boolean),
      ),
  );

  const linkedIds = new Set(
    (edges || [])
      .filter(
        (edge) =>
          selectedCards.some((card) => card.id === edge.from_card) ||
          selectedCards.some((card) => card.id === edge.to_card),
      )
      .flatMap((edge) =>
        selectedCards.flatMap((card) => {
          if (edge.from_card === card.id) {
            return [edge.to_card];
          }
          if (edge.to_card === card.id) {
            return [edge.from_card];
          }
          return [];
        }),
      ),
  );
  const linkedFiles = fileCards.filter((card) => linkedIds.has(card.id)).map(resolveRelPath).filter(Boolean);
  const combined = unique([...directFiles, ...groupFiles, ...linkedFiles]);
  const selectedFiles = combined.length ? combined : allBoardFiles;
  const reasonParts = [];
  if (directFiles.length) {
    reasonParts.push(`${directFiles.length} direct file card${directFiles.length === 1 ? "" : "s"}`);
  }
  if (groupFiles.length) {
    reasonParts.push(`${groupFiles.length} file${groupFiles.length === 1 ? "" : "s"} gathered through selected groups`);
  }
  if (linkedFiles.length) {
    reasonParts.push(`${linkedFiles.length} linked file${linkedFiles.length === 1 ? "" : "s"}`);
  }
  return {
    selected_files: selectedFiles,
    direct_files: directFiles,
    group_files: groupFiles,
    linked_files: unique(linkedFiles),
    selected_card_ids: activeCards.map((card) => card.id),
    selected_card_labels: activeCards.map((card) => card.label),
    note_card_count: activeCards.filter((card) => card.type === "text").length,
    group_card_count: activeCards.filter((card) => card.type === "group").length,
    link_count: (edges || []).filter(
      (edge) => activeCards.some((card) => card.id === edge.from_card || card.id === edge.to_card),
    ).length,
    why_summary: reasonParts.length
      ? `Scope includes ${reasonParts.join(", ")}.`
      : "No direct file cards were selected, so the board-wide file set is being used.",
  };
}


function createTextCard(index) {
  return normalizeCard({
    id: crypto.randomUUID(),
    type: "text",
    label: "New note",
    text: "Capture an idea, decision, or question here.",
    x: 120 + index * 24,
    y: 120 + index * 18,
    width: 320,
    height: 220,
    color: "mint",
  });
}


function createGroupCard(index) {
  return normalizeCard({
    id: crypto.randomUUID(),
    type: "group",
    label: "New cluster",
    note: "Use this frame to gather related files, notes, and next actions.",
    x: 80 + index * 20,
    y: 90 + index * 16,
    width: 520,
    height: 320,
    color: "amber",
  });
}


function createFileCard(file, index) {
  return normalizeCard({
    id: crypto.randomUUID(),
    type: "file",
    label: file?.label || "Selected file",
    path: file?.original_path || null,
    file_id: file?.id || null,
    text: file?.summary || file?.rel_path || "",
    note: "",
    x: 150 + index * 22,
    y: 150 + index * 18,
    width: 340,
    height: 220,
    color: "violet",
  });
}


function joinLines(values = []) {
  return (values || []).filter(Boolean).join("\n");
}


function splitLines(value = "") {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}


function BoardStat({ label, value }) {
  return (
    <div className="canvas-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}


function MiniBoardPreview({ canvas, statusMap = {}, title, viewportInfo = null, onNavigate = null }) {
  const cards = (canvas?.cards || []).map(normalizeCard);
  const bounds = (() => {
    if (!cards.length) {
      return { minX: 0, minY: 0, width: 600, height: 360 };
    }
    const minX = Math.min(...cards.map((card) => card.x));
    const minY = Math.min(...cards.map((card) => card.y));
    const maxX = Math.max(...cards.map((card) => card.x + card.width));
    const maxY = Math.max(...cards.map((card) => card.y + card.height));
    return { minX, minY, width: Math.max(520, maxX - minX), height: Math.max(320, maxY - minY) };
  })();
  const scale = Math.min(280 / bounds.width, 180 / bounds.height, 1);
  const viewportRect = viewportInfo
    ? {
        left: ((viewportInfo.x - bounds.minX) * scale),
        top: ((viewportInfo.y - bounds.minY) * scale),
        width: viewportInfo.width * scale,
        height: viewportInfo.height * scale,
      }
    : null;
  return (
    <div className="canvas-mini-board">
      <strong>{title}</strong>
      <div
        className={`canvas-mini-board__frame ${onNavigate ? "canvas-mini-board__frame--interactive" : ""}`}
        onClick={(event) => {
          if (!onNavigate) {
            return;
          }
          const rect = event.currentTarget.getBoundingClientRect();
          const scaledX = event.clientX - rect.left;
          const scaledY = event.clientY - rect.top;
          onNavigate({
            x: scaledX / scale + bounds.minX,
            y: scaledY / scale + bounds.minY,
          });
        }}
      >
        <div
          className="canvas-mini-board__surface"
          style={{
            width: `${bounds.width}px`,
            height: `${bounds.height}px`,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {cards.map((card) => (
            <div
              key={card.id}
              className={`canvas-mini-card canvas-mini-card--${statusMap[card.id] || "neutral"}`}
              style={{
                left: `${card.x - bounds.minX}px`,
                top: `${card.y - bounds.minY}px`,
                width: `${card.width}px`,
                height: `${card.height}px`,
              }}
            >
              <span>{card.label}</span>
            </div>
          ))}
        </div>
        {viewportRect ? (
          <div
            className="canvas-mini-board__viewport"
            style={{
              left: `${viewportRect.left}px`,
              top: `${viewportRect.top}px`,
              width: `${viewportRect.width}px`,
              height: `${viewportRect.height}px`,
            }}
          />
        ) : null}
      </div>
    </div>
  );
}


export default function CanvasBoard({
  canvases,
  templates = [],
  currentLane = "structure",
  selectedCanvasId,
  onSelectCanvas,
  onCreateCanvas,
  onCreateCanvasFromTemplate,
  onCreateCanvasFromSavedTemplate,
  onImportCanvasBoard,
  onSaveCanvas,
  onSaveCanvasState,
  onSaveCanvasAsTemplate,
  onUpdateCanvasTemplateFromCanvas,
  onDeleteCanvasTemplate,
  onDeleteCanvas,
  onDuplicateCanvas,
  onExportCanvasBoard,
  onOpenFile,
  onRunLogicScope,
  onExplainScope,
  onUseScopeInBuild,
  onCreatePatchPreviewScope,
  onSaveScope,
  onSaveScopeAsPreset,
  onPromoteScope,
  selectedFile,
  files = [],
  recentFiles = [],
  bookmarkFiles = [],
  canvasSnapshots = [],
  onRestoreCanvasSnapshot,
  historyTimeline = [],
  buildPatchPreviews = [],
  buildApplyRuns = [],
  linkedBrainRecords = [],
  onOpenDigitalBrainRecord,
}) {
  const selectedCanvas = useMemo(
    () => normalizeCanvas(canvases.find((canvas) => canvas.id === selectedCanvasId) || canvases[0] || null),
    [canvases, selectedCanvasId],
  );
  const [draft, setDraft] = useState(null);
  const [selectedCardIds, setSelectedCardIds] = useState([]);
  const [linkingFromId, setLinkingFromId] = useState("");
  const [dragState, setDragState] = useState(null);
  const [resizeState, setResizeState] = useState(null);
  const [panState, setPanState] = useState(null);
  const [selectionBox, setSelectionBox] = useState(null);
  const [snapGuides, setSnapGuides] = useState([]);
  const [interactionMode, setInteractionMode] = useState("pan");
  const [trayQuery, setTrayQuery] = useState("");
  const [compareLeftSnapshotId, setCompareLeftSnapshotId] = useState("");
  const [compareRightSnapshotId, setCompareRightSnapshotId] = useState("");
  const [historyPast, setHistoryPast] = useState([]);
  const [historyFuture, setHistoryFuture] = useState([]);
  const [recoveryDraft, setRecoveryDraft] = useState(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }
    return window.localStorage.getItem("context-vault-canvas-autosave") !== "off";
  });
  const [saving, setSaving] = useState(false);
  const stageRef = useRef(null);

  useEffect(() => {
    setDraft(selectedCanvas);
    setSelectedCardIds([]);
    setLinkingFromId("");
    setDragState(null);
    setResizeState(null);
    setPanState(null);
    setSelectionBox(null);
    setSnapGuides([]);
    setHistoryPast([]);
    setHistoryFuture([]);
    if (typeof window !== "undefined" && selectedCanvas?.id) {
      const key = `context-vault-canvas-draft:${selectedCanvas.id}`;
      const savedDraft = window.localStorage.getItem(key);
      if (savedDraft) {
        try {
          const parsed = normalizeCanvas(JSON.parse(savedDraft));
          const savedPayload = JSON.stringify({
            name: parsed.name,
            description: parsed.description,
            cards: parsed.cards,
            edges: parsed.edges,
            viewport: parsed.viewport,
            metadata: parsed.metadata,
          });
          const selectedPayload = JSON.stringify({
            name: selectedCanvas.name,
            description: selectedCanvas.description,
            cards: selectedCanvas.cards,
            edges: selectedCanvas.edges,
            viewport: selectedCanvas.viewport,
            metadata: selectedCanvas.metadata,
          });
          setRecoveryDraft(savedPayload === selectedPayload ? null : parsed);
        } catch {
          setRecoveryDraft(null);
        }
      } else {
        setRecoveryDraft(null);
      }
    } else {
      setRecoveryDraft(null);
    }
  }, [selectedCanvas]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem("context-vault-canvas-autosave", autoSaveEnabled ? "on" : "off");
  }, [autoSaveEnabled]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return undefined;
    }
    function updateStageSize() {
      setStageSize({
        width: stage.clientWidth,
        height: stage.clientHeight,
      });
    }
    updateStageSize();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateStageSize);
      return () => window.removeEventListener("resize", updateStageSize);
    }
    const observer = new ResizeObserver(updateStageSize);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [selectedCanvasId]);

  const selectedCards = useMemo(
    () => (draft?.cards || []).filter((card) => selectedCardIds.includes(card.id)),
    [draft?.cards, selectedCardIds],
  );
  const selectedCard = useMemo(
    () => selectedCards[selectedCards.length - 1] || null,
    [selectedCards],
  );

  const fileLookup = useMemo(() => new Map(files.map((file) => [file.id, file])), [files]);

  const isDirty = useMemo(() => {
    if (!draft || !selectedCanvas) {
      return false;
    }
    const draftPayload = JSON.stringify({
      name: draft.name,
      description: draft.description,
      cards: draft.cards,
      edges: draft.edges,
      viewport: draft.viewport,
      metadata: draft.metadata,
    });
    const selectedPayload = JSON.stringify({
      name: selectedCanvas.name,
      description: selectedCanvas.description,
      cards: selectedCanvas.cards,
      edges: selectedCanvas.edges,
      viewport: selectedCanvas.viewport,
      metadata: selectedCanvas.metadata,
    });
    return draftPayload !== selectedPayload;
  }, [draft, selectedCanvas]);

  const linkedEdges = useMemo(
    () =>
      (draft?.edges || []).filter(
        (edge) => selectedCardIds.includes(edge.from_card) || selectedCardIds.includes(edge.to_card),
      ),
    [draft, selectedCardIds],
  );
  const currentScopeDetails = useMemo(
    () => collectScopeDetails(draft?.cards || [], selectedCards, draft?.edges || [], fileLookup, files),
    [draft?.cards, draft?.edges, fileLookup, files, selectedCards],
  );
  const currentScope = useMemo(
    () => ({
      canvas_id: draft?.id || "",
      selected_files: currentScopeDetails.selected_files,
      label:
        selectedCards.length > 1
          ? `${draft?.name}: ${selectedCards.length} selected cards`
          : selectedCard
            ? `${draft?.name}: ${selectedCard.label}`
            : draft?.name || "Canvas board",
      description: selectedCards.length > 1
        ? `Scoped from ${selectedCards.length} selected cards on the board.`
        : selectedCard
          ? `Scoped from ${selectedCard.type} card "${selectedCard.label}".`
        : "Scoped from all file cards on the board.",
      card_count: selectedCards.length || draft?.cards?.length || 0,
      selected_card_ids: currentScopeDetails.selected_card_ids,
      selected_card_labels: currentScopeDetails.selected_card_labels,
      note_card_count: currentScopeDetails.note_card_count,
      group_card_count: currentScopeDetails.group_card_count,
      link_count: currentScopeDetails.link_count,
      why_summary: currentScopeDetails.why_summary,
      build_goal: draft?.metadata?.build_goal || "",
      allowed_targets: draft?.metadata?.allowed_targets || [],
      forbidden_paths: draft?.metadata?.forbidden_paths || [],
      workflow: draft?.metadata?.workflow || "research-synthesis",
      review_notes: draft?.metadata?.review_notes || "",
      snapshot_label: draft?.metadata?.snapshot_label || "",
    }),
    [currentScopeDetails, draft?.cards?.length, draft?.id, draft?.metadata, draft?.name, selectedCard, selectedCards.length],
  );
  const boardTimeline = useMemo(
    () =>
      (historyTimeline || [])
        .filter((item) => item.summary?.canvas_id === draft?.id)
        .slice(0, 8),
    [draft?.id, historyTimeline],
  );
  const latestBoardSnapshot = canvasSnapshots[0] || null;
  const latestBoardDelta = useMemo(() => {
    if (!latestBoardSnapshot) {
      return null;
    }
    const leftCanvas = latestBoardSnapshot.content?.canvas || {};
    const rightCanvas = draft || {};
    const leftCards = new Map((leftCanvas.cards || []).map((card) => [card.id, card]));
    const rightCards = new Map((rightCanvas.cards || []).map((card) => [card.id, card]));
    const added = [...rightCards.keys()].filter((id) => !leftCards.has(id));
    const removed = [...leftCards.keys()].filter((id) => !rightCards.has(id));
    const shared = [...rightCards.keys()].filter((id) => leftCards.has(id));
    const moved = shared.filter((id) => {
      const left = leftCards.get(id);
      const right = rightCards.get(id);
      return left?.x !== right?.x || left?.y !== right?.y;
    });
    const edited = shared.filter((id) => {
      const left = leftCards.get(id);
      const right = rightCards.get(id);
      return left?.label !== right?.label || left?.text !== right?.text || left?.note !== right?.note;
    });
    return {
      added,
      removed,
      moved,
      edited,
      changedLinks: Math.abs((rightCanvas.edges || []).length - (leftCanvas.edges || []).length),
    };
  }, [draft, latestBoardSnapshot]);
  const linkedBoardPatchPreview = useMemo(
    () => (buildPatchPreviews || []).find((item) => item.canvas_id === draft?.id) || null,
    [buildPatchPreviews, draft?.id],
  );
  const linkedBoardApplyRun = useMemo(
    () => (buildApplyRuns || []).find((item) => item.canvas_id === draft?.id) || null,
    [buildApplyRuns, draft?.id],
  );
  const linkedBoardRecords = useMemo(
    () => (linkedBrainRecords || []).filter((item) => item.canvas_id === draft?.id),
    [draft?.id, linkedBrainRecords],
  );
  const scopeHealth = useMemo(() => {
    const checks = [
      {
        id: "files",
        label: "At least one file is in scope",
        pass: currentScope.selected_files.length > 0,
      },
      {
        id: "goal",
        label: "Board build goal is written",
        pass: Boolean(draft?.metadata?.build_goal?.trim()),
      },
      {
        id: "targets",
        label: "Allowed targets are defined",
        pass: Boolean(draft?.metadata?.allowed_targets?.length),
      },
      {
        id: "review",
        label: "Board review has been finalized",
        pass: draft?.metadata?.review_status === "reviewed" || draft?.metadata?.review_status === "approved",
      },
      {
        id: "snapshot",
        label: "A board-state milestone exists",
        pass: canvasSnapshots.length > 0,
      },
    ];
    return {
      checks,
      passedCount: checks.filter((item) => item.pass).length,
      totalCount: checks.length,
    };
  }, [canvasSnapshots.length, currentScope.selected_files.length, draft?.metadata]);
  const trayFiles = useMemo(() => {
    const ordered = [
      selectedFile,
      ...bookmarkFiles,
      ...recentFiles,
      ...files.slice(0, 18),
    ].filter(Boolean);
    const deduped = unique(ordered.map((file) => file.original_path)).map((path) =>
      ordered.find((file) => file.original_path === path),
    );
    const query = trayQuery.trim().toLowerCase();
    if (!query) {
      return deduped.slice(0, 18);
    }
    return deduped
      .filter((file) =>
        [file.label, file.rel_path, file.summary]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
      .slice(0, 18);
  }, [bookmarkFiles, files, recentFiles, selectedFile, trayQuery]);
  const compareLeftSnapshot = canvasSnapshots.find((item) => item.id === compareLeftSnapshotId) || null;
  const compareRightSnapshot = canvasSnapshots.find((item) => item.id === compareRightSnapshotId) || null;
  const canvasSnapshotComparison = useMemo(() => {
    if (!compareLeftSnapshot || !compareRightSnapshot) {
      return null;
    }
    const leftCanvas = compareLeftSnapshot.content?.canvas || {};
    const rightCanvas = compareRightSnapshot.content?.canvas || {};
    const leftCards = new Map((leftCanvas.cards || []).map((card) => [card.id, card]));
    const rightCards = new Map((rightCanvas.cards || []).map((card) => [card.id, card]));
    const added = [...rightCards.keys()].filter((id) => !leftCards.has(id));
    const removed = [...leftCards.keys()].filter((id) => !rightCards.has(id));
    const shared = [...rightCards.keys()].filter((id) => leftCards.has(id));
    const moved = shared.filter((id) => {
      const left = leftCards.get(id);
      const right = rightCards.get(id);
      return left?.x !== right?.x || left?.y !== right?.y;
    });
    const resized = shared.filter((id) => {
      const left = leftCards.get(id);
      const right = rightCards.get(id);
      return left?.width !== right?.width || left?.height !== right?.height;
    });
    const edited = shared.filter((id) => {
      const left = leftCards.get(id);
      const right = rightCards.get(id);
      return left?.label !== right?.label || left?.text !== right?.text || left?.note !== right?.note;
    });
    return {
      added,
      removed,
      moved,
      resized,
      edited,
      addedLabels: added.map((id) => rightCards.get(id)?.label || id),
      removedLabels: removed.map((id) => leftCards.get(id)?.label || id),
      movedLabels: moved.map((id) => rightCards.get(id)?.label || leftCards.get(id)?.label || id),
      resizedLabels: resized.map((id) => rightCards.get(id)?.label || leftCards.get(id)?.label || id),
      editedLabels: edited.map((id) => rightCards.get(id)?.label || leftCards.get(id)?.label || id),
    };
  }, [compareLeftSnapshot, compareRightSnapshot]);
  const compareLeftStatusMap = useMemo(() => {
    if (!canvasSnapshotComparison) {
      return {};
    }
    return Object.fromEntries([
      ...canvasSnapshotComparison.removed.map((id) => [id, "removed"]),
      ...canvasSnapshotComparison.moved.map((id) => [id, "moved"]),
      ...canvasSnapshotComparison.resized.map((id) => [id, "resized"]),
      ...canvasSnapshotComparison.edited.map((id) => [id, "edited"]),
    ]);
  }, [canvasSnapshotComparison]);
  const compareRightStatusMap = useMemo(() => {
    if (!canvasSnapshotComparison) {
      return {};
    }
    return Object.fromEntries([
      ...canvasSnapshotComparison.added.map((id) => [id, "added"]),
      ...canvasSnapshotComparison.moved.map((id) => [id, "moved"]),
      ...canvasSnapshotComparison.resized.map((id) => [id, "resized"]),
      ...canvasSnapshotComparison.edited.map((id) => [id, "edited"]),
    ]);
  }, [canvasSnapshotComparison]);

  if (!draft) {
    return null;
  }

  const localDraftKey = selectedCanvas?.id ? `context-vault-canvas-draft:${selectedCanvas.id}` : "";
  const currentViewportInfo =
    stageSize.width && stageSize.height
      ? {
          x: -draft.viewport.x / draft.viewport.zoom,
          y: -draft.viewport.y / draft.viewport.zoom,
          width: stageSize.width / draft.viewport.zoom,
          height: stageSize.height / draft.viewport.zoom,
        }
      : null;

  function centerViewportOnBoardPoint(point) {
    patchDraft((current) => ({
      ...current,
      viewport: {
        ...current.viewport,
        x: stageSize.width / 2 - point.x * current.viewport.zoom,
        y: stageSize.height / 2 - point.y * current.viewport.zoom,
      },
    }));
  }

  function patchDraft(updater, options = {}) {
    const { recordHistory = true } = options;
    setDraft((current) => {
      if (!current) {
        return current;
      }
      const next = typeof updater === "function" ? updater(current) : updater;
      if (JSON.stringify(next) === JSON.stringify(current)) {
        return current;
      }
      if (recordHistory) {
        setHistoryPast((past) => [...past.slice(-39), current]);
        setHistoryFuture([]);
      }
      return next;
    });
  }

  function undoDraft() {
    if (!historyPast.length || !draft) {
      return;
    }
    const previous = historyPast[historyPast.length - 1];
    setHistoryPast((past) => past.slice(0, -1));
    setHistoryFuture((future) => [draft, ...future.slice(0, 39)]);
    setDraft(previous);
  }

  function redoDraft() {
    if (!historyFuture.length || !draft) {
      return;
    }
    const next = historyFuture[0];
    setHistoryFuture((future) => future.slice(1));
    setHistoryPast((past) => [...past.slice(-39), draft]);
    setDraft(next);
  }

  function recenterCanvas() {
    const stageRect = stageRef.current?.getBoundingClientRect();
    patchDraft((current) => ({
      ...current,
      viewport: fitViewport(current.cards || [], stageRect),
    }));
  }

  function updateBoardMetadata(field, value) {
    patchDraft((current) => ({
      ...current,
      metadata: {
        ...normalizeCanvasMetadata(current.metadata),
        [field]: value,
      },
    }));
  }

  async function saveBoard(trigger = "manual") {
    if (!draft || saving) {
      return;
    }
    setSaving(true);
    try {
      await onSaveCanvas({
        ...draft,
        viewport: normalizeViewport(draft.viewport),
      });
      if (typeof window !== "undefined" && localDraftKey) {
        window.localStorage.removeItem(localDraftKey);
      }
      setRecoveryDraft(null);
      if (trigger !== "autosave" && draft.metadata?.auto_snapshot_on_save) {
        await onSaveCanvasState(draft, {
          skipSave: true,
          label: draft.metadata?.snapshot_label?.trim() || `${draft.name} board state`,
          silent: true,
        });
      }
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!autoSaveEnabled || !isDirty || saving || dragState || resizeState || panState || selectionBox) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      saveBoard("autosave");
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [autoSaveEnabled, dragState, isDirty, panState, resizeState, saving, selectionBox, draft]);

  useEffect(() => {
    if (typeof window === "undefined" || !localDraftKey || !draft) {
      return;
    }
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(
        localDraftKey,
        JSON.stringify({
          name: draft.name,
          description: draft.description,
          cards: draft.cards,
          edges: draft.edges,
          viewport: draft.viewport,
          metadata: draft.metadata,
        }),
      );
    }, 250);
    return () => window.clearTimeout(timer);
  }, [draft, localDraftKey]);

  useEffect(() => {
    function handleKeyDown(event) {
      const isMeta = event.metaKey || event.ctrlKey;
      const activeTag = document.activeElement?.tagName;
      if (isMeta && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        undoDraft();
        return;
      }
      if ((isMeta && event.shiftKey && event.key.toLowerCase() === "z") || (!event.metaKey && event.ctrlKey && event.key.toLowerCase() === "y")) {
        event.preventDefault();
        redoDraft();
        return;
      }
      if (event.key === "0") {
        recenterCanvas();
      }
      if (event.key === "=" || event.key === "+") {
        event.preventDefault();
        patchDraft((current) => ({ ...current, viewport: { ...current.viewport, zoom: clamp(current.viewport.zoom + 0.1, MIN_ZOOM, MAX_ZOOM) } }));
      }
      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        patchDraft((current) => ({ ...current, viewport: { ...current.viewport, zoom: clamp(current.viewport.zoom - 0.1, MIN_ZOOM, MAX_ZOOM) } }));
      }
      if (isMeta && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelectedCardIds((draft?.cards || []).map((card) => card.id));
        return;
      }
      if (selectedCardIds.length && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) && activeTag !== "INPUT" && activeTag !== "TEXTAREA" && activeTag !== "SELECT") {
        event.preventDefault();
        const amount = event.shiftKey ? 24 : 8;
        if (event.key === "ArrowLeft") moveSelectedBy(-amount, 0);
        if (event.key === "ArrowRight") moveSelectedBy(amount, 0);
        if (event.key === "ArrowUp") moveSelectedBy(0, -amount);
        if (event.key === "ArrowDown") moveSelectedBy(0, amount);
        return;
      }
      if (!isMeta && !event.altKey && activeTag !== "INPUT" && activeTag !== "TEXTAREA" && activeTag !== "SELECT") {
        if (event.key.toLowerCase() === "g") {
          event.preventDefault();
          addGroupCard();
          return;
        }
        if (event.key.toLowerCase() === "n") {
          event.preventDefault();
          addTextCard();
          return;
        }
      }
      if ((event.key === "Backspace" || event.key === "Delete") && selectedCardIds.length) {
        if (activeTag !== "INPUT" && activeTag !== "TEXTAREA" && activeTag !== "SELECT") {
          event.preventDefault();
          selectedCardIds.forEach((cardId) => removeCard(cardId));
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedCardIds, historyPast, historyFuture, draft]);

  function addTextCard() {
    patchDraft((current) => {
      const nextCards = [...(current.cards || []), createTextCard((current.cards || []).length)];
      return { ...current, cards: nextCards };
    });
  }

  function addGroupCard() {
    patchDraft((current) => {
      const nextCards = [...(current.cards || []), createGroupCard((current.cards || []).length)];
      return { ...current, cards: nextCards };
    });
  }

  function addSelectedFileCard() {
    if (!selectedFile) {
      return;
    }
    patchDraft((current) => {
      const nextCards = [...(current.cards || []), createFileCard(selectedFile, (current.cards || []).length)];
      return { ...current, cards: nextCards };
    });
  }

  function addFileCardAt(file, x = null, y = null) {
    if (!file) {
      return;
    }
    patchDraft((current) => {
      const next = createFileCard(file, (current.cards || []).length);
      if (x != null) {
        next.x = clamp(x, 16, SURFACE_WIDTH - next.width - 16);
      }
      if (y != null) {
        next.y = clamp(y, 16, SURFACE_HEIGHT - next.height - 16);
      }
      return {
        ...current,
        cards: [...(current.cards || []), next],
      };
    });
  }

  function moveSelectedBy(dx, dy) {
    if (!selectedCardIds.length) {
      return;
    }
    patchDraft((current) => ({
      ...current,
      cards: (current.cards || []).map((card) =>
        selectedCardIds.includes(card.id)
          ? clampCard({ ...card, x: card.x + dx, y: card.y + dy })
          : card,
      ),
    }));
  }

  function alignSelected(mode) {
    if (selectedCards.length < 2) {
      return;
    }
    const bounds = boundsForCards(selectedCards);
    patchDraft((current) => ({
      ...current,
      cards: (current.cards || []).map((card) => {
        if (!selectedCardIds.includes(card.id)) {
          return card;
        }
        if (mode === "left") return { ...card, x: bounds.x };
        if (mode === "center") return { ...card, x: bounds.x + bounds.width / 2 - card.width / 2 };
        if (mode === "right") return { ...card, x: bounds.x + bounds.width - card.width };
        if (mode === "top") return { ...card, y: bounds.y };
        if (mode === "middle") return { ...card, y: bounds.y + bounds.height / 2 - card.height / 2 };
        if (mode === "bottom") return { ...card, y: bounds.y + bounds.height - card.height };
        return card;
      }),
    }));
  }

  function duplicateSelectedCard() {
    if (!selectedCards.length) {
      return;
    }
    const nextCards = selectedCards.map((card, index) =>
      normalizeCard({
        ...card,
        id: crypto.randomUUID(),
        x: Number(card.x) + 36 + index * 10,
        y: Number(card.y) + 28 + index * 8,
      }),
    );
    patchDraft((current) => ({
      ...current,
      cards: [...(current.cards || []), ...nextCards],
    }));
    setSelectedCardIds(nextCards.map((card) => card.id));
  }

  function removeCard(cardId) {
    patchDraft((current) => ({
      ...current,
      cards: (current.cards || []).filter((card) => card.id !== cardId),
      edges: (current.edges || []).filter((edge) => edge.from_card !== cardId && edge.to_card !== cardId),
    }));
    setSelectedCardIds((current) => current.filter((id) => id !== cardId));
    if (linkingFromId === cardId) {
      setLinkingFromId("");
    }
  }

  function removeEdge(edgeId) {
    patchDraft((current) => ({
      ...current,
      edges: (current.edges || []).filter((edge) => edge.id !== edgeId),
    }));
  }

  function updateCard(cardId, field, value) {
    patchDraft((current) => ({
      ...current,
      cards: (current.cards || []).map((card) => (card.id === cardId ? { ...card, [field]: value } : card)),
    }));
  }

  function updateEdge(edgeId, field, value) {
    patchDraft((current) => ({
      ...current,
      edges: (current.edges || []).map((edge) => (edge.id === edgeId ? { ...edge, [field]: value } : edge)),
    }));
  }

  function exportScopePacket() {
    if (typeof window === "undefined" || !currentScope.selected_files.length) {
      return;
    }
    const payload = {
      kind: "canvas_scope_packet",
      exported_at: new Date().toISOString(),
      canvas_id: draft.id,
      canvas_name: draft.name,
      scope: currentScope,
      board_metadata: draft.metadata,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${draft.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-scope-packet.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function finalizeBoardReview() {
    const reviewedDraft = normalizeCanvas({
      ...draft,
      metadata: {
        ...draft.metadata,
        review_status: "reviewed",
        last_reviewed_at: new Date().toISOString(),
      },
    });
    setDraft(reviewedDraft);
    await onSaveCanvasState(reviewedDraft, {
      label: reviewedDraft.metadata?.snapshot_label?.trim() || `${reviewedDraft.name} review milestone`,
    });
  }

  function startCardDrag(event, card) {
    event.stopPropagation();
    if (card.locked) {
      return;
    }
    const stageRect = stageRef.current?.getBoundingClientRect();
    if (!stageRect) {
      return;
    }
    const point = boardPoint(stageRect, draft.viewport, event.clientX, event.clientY);
    const selectedIds = selectedCardIds.includes(card.id) ? selectedCardIds : [card.id];
    const startCards = (draft.cards || []).filter((item) => selectedIds.includes(item.id));
    setDragState({
      selectedIds,
      pointerX: point.x,
      pointerY: point.y,
      startCards,
    });
  }

  function startResize(event, card) {
    event.stopPropagation();
    if (card.locked) {
      return;
    }
    const stageRect = stageRef.current?.getBoundingClientRect();
    if (!stageRect) {
      return;
    }
    const point = boardPoint(stageRect, draft.viewport, event.clientX, event.clientY);
    const selectedIds = selectedCardIds.includes(card.id) ? selectedCardIds : [card.id];
    const startCards = (draft.cards || []).filter((item) => selectedIds.includes(item.id));
    setResizeState({
      cardId: card.id,
      selectedIds,
      startCards,
      startBounds: boundsForCards(startCards),
      pointerX: point.x,
      pointerY: point.y,
    });
  }

  function startStageInteraction(event) {
    if (event.target?.closest?.(".canvas-card")) {
      return;
    }
    setSelectedCardIds([]);
    if (interactionMode === "lasso") {
      const stageRect = stageRef.current?.getBoundingClientRect();
      if (!stageRect) {
        return;
      }
      const point = boardPoint(stageRect, draft.viewport, event.clientX, event.clientY);
      setSelectionBox({
        startX: point.x,
        startY: point.y,
        endX: point.x,
        endY: point.y,
      });
      return;
    }
    setPanState({
      pointerX: event.clientX,
      pointerY: event.clientY,
      viewportX: draft.viewport.x,
      viewportY: draft.viewport.y,
    });
  }

  function onPointerMove(event) {
    if (dragState) {
      const stageRect = stageRef.current?.getBoundingClientRect();
      if (!stageRect) {
        return;
      }
      const point = boardPoint(stageRect, draft.viewport, event.clientX, event.clientY);
      const dx = point.x - dragState.pointerX;
      const dy = point.y - dragState.pointerY;
      const movedCards = dragState.startCards.map((card) =>
        clampCard({
          ...card,
          x: card.x + dx,
          y: card.y + dy,
        }),
      );
      const movedBounds = boundsForCards(movedCards);
      const snap = applyRectSnapping(movedBounds, collectSnapTargets(draft.cards || [], dragState.selectedIds));
      const snapDx = snap.x - movedBounds.x;
      const snapDy = snap.y - movedBounds.y;
      setSnapGuides(snap.guides);
      patchDraft((current) => ({
        ...current,
        cards: (current.cards || []).map((card) =>
          dragState.selectedIds.includes(card.id)
            ? clampCard({
                ...card,
                x: dragState.startCards.find((item) => item.id === card.id).x + dx + snapDx,
                y: dragState.startCards.find((item) => item.id === card.id).y + dy + snapDy,
              })
            : card,
        ),
      }), { recordHistory: false });
      return;
    }

    if (resizeState) {
      const stageRect = stageRef.current?.getBoundingClientRect();
      if (!stageRect) {
        return;
      }
      const point = boardPoint(stageRect, draft.viewport, event.clientX, event.clientY);
      const deltaX = point.x - resizeState.pointerX;
      const deltaY = point.y - resizeState.pointerY;
      patchDraft((current) => ({
        ...current,
        cards: (current.cards || []).map((card) => {
          if (!resizeState.selectedIds.includes(card.id)) {
            return card;
          }
          if (resizeState.selectedIds.length === 1) {
            if (card.id !== resizeState.cardId) {
              return card;
            }
            return {
              ...card,
              width: clamp(card.width + deltaX, card.type === "group" ? 260 : 220, 760),
              height: clamp(card.height + deltaY, card.type === "group" ? 180 : 160, 640),
            };
          }
          const bounds = resizeState.startBounds;
          const startCard = resizeState.startCards.find((item) => item.id === card.id);
          const targetWidth = Math.max(bounds.width + deltaX, 240);
          const targetHeight = Math.max(bounds.height + deltaY, 220);
          const scaleX = bounds.width ? targetWidth / bounds.width : 1;
          const scaleY = bounds.height ? targetHeight / bounds.height : 1;
          return clampCard({
            ...card,
            x: bounds.x + (startCard.x - bounds.x) * scaleX,
            y: bounds.y + (startCard.y - bounds.y) * scaleY,
            width: Math.max((startCard.width || 220) * scaleX, card.type === "group" ? 260 : 220),
            height: Math.max((startCard.height || 160) * scaleY, card.type === "group" ? 180 : 160),
          });
        }),
      }), { recordHistory: false });
      return;
    }

    if (panState) {
      patchDraft((current) => ({
        ...current,
        viewport: {
          ...current.viewport,
          x: panState.viewportX + (event.clientX - panState.pointerX),
          y: panState.viewportY + (event.clientY - panState.pointerY),
        },
      }));
    }

    if (selectionBox) {
      const stageRect = stageRef.current?.getBoundingClientRect();
      if (!stageRect) {
        return;
      }
      const point = boardPoint(stageRect, draft.viewport, event.clientX, event.clientY);
      setSelectionBox((current) =>
        current
          ? {
              ...current,
              endX: point.x,
              endY: point.y,
            }
          : current,
      );
    }
  }

  function stopPointerWork() {
    if (selectionBox) {
      const minX = Math.min(selectionBox.startX, selectionBox.endX);
      const maxX = Math.max(selectionBox.startX, selectionBox.endX);
      const minY = Math.min(selectionBox.startY, selectionBox.endY);
      const maxY = Math.max(selectionBox.startY, selectionBox.endY);
      const selectedIds = (draft.cards || [])
        .filter((card) => {
          const centerX = card.x + card.width / 2;
          const centerY = card.y + card.height / 2;
          return centerX >= minX && centerX <= maxX && centerY >= minY && centerY <= maxY;
        })
        .map((card) => card.id);
      setSelectedCardIds(selectedIds);
    }
    setDragState(null);
    setResizeState(null);
    setPanState(null);
    setSelectionBox(null);
    setSnapGuides([]);
  }

  function onWheel(event) {
    event.preventDefault();
    const stageRect = stageRef.current?.getBoundingClientRect();
    if (!stageRect) {
      return;
    }
    const nextZoom = clamp(draft.viewport.zoom + (event.deltaY < 0 ? 0.08 : -0.08), MIN_ZOOM, MAX_ZOOM);
    const point = boardPoint(stageRect, draft.viewport, event.clientX, event.clientY);
    patchDraft((current) => ({
      ...current,
      viewport: {
        x: event.clientX - stageRect.left - point.x * nextZoom,
        y: event.clientY - stageRect.top - point.y * nextZoom,
        zoom: nextZoom,
      },
    }));
  }

  function handleCardClick(event, card) {
    event.stopPropagation();
    setSelectedCardIds((current) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey) {
        return current.includes(card.id) ? current.filter((id) => id !== card.id) : [...current, card.id];
      }
      return [card.id];
    });
    if (linkingFromId && linkingFromId !== card.id) {
      const exists = draft.edges.some(
        (edge) =>
          (edge.from_card === linkingFromId && edge.to_card === card.id) ||
          (edge.from_card === card.id && edge.to_card === linkingFromId),
      );
      if (!exists) {
        patchDraft((current) => ({
          ...current,
          edges: [
            ...(current.edges || []),
            {
              id: crypto.randomUUID(),
              from_card: linkingFromId,
              to_card: card.id,
              label: "",
              color: "mint",
            },
          ],
        }));
      }
      setLinkingFromId("");
    }
  }

  const cardMap = new Map((draft.cards || []).map((card) => [card.id, card]));

  return (
    <section className="panel canvas-panel">
      <div className="panel__header panel__header--spread">
        <div>
          <span className="eyebrow">Canvas</span>
          <h3>Working board</h3>
          <p className="microcopy">
            Use the canvas to group important files, write working notes, map relationships, and shape a focused board before sending it to Logic, Explain, or Build.
          </p>
        </div>
        <div className="hero__actions hero__actions--tight">
          <button className="secondary-button" type="button" onClick={onCreateCanvas}>
            New canvas
          </button>
          <button className="ghost-button" type="button" onClick={onImportCanvasBoard}>
            Import board
          </button>
          <button className="ghost-button" type="button" onClick={() => onDuplicateCanvas(draft)} disabled={!draft}>
            Duplicate
          </button>
          <button className="ghost-button" type="button" onClick={() => onDeleteCanvas(draft)} disabled={canvases.length <= 1}>
            Delete
          </button>
          <button className="secondary-button" type="button" onClick={addTextCard}>
            Add note card
          </button>
          <button className="secondary-button" type="button" onClick={addGroupCard}>
            Add group
          </button>
          <button className="primary-button" type="button" onClick={addSelectedFileCard} disabled={!selectedFile}>
            Add selected file
          </button>
          <button className="ghost-button" type="button" onClick={saveBoard} disabled={!isDirty || saving}>
            {saving ? "Saving..." : isDirty ? "Save board" : "Saved"}
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() => onSaveCanvasState(draft, { label: draft.metadata?.snapshot_label?.trim() || `${draft.name} board state` })}
          >
            Save board state
          </button>
          <button className="ghost-button" type="button" onClick={undoDraft} disabled={!historyPast.length}>
            Undo
          </button>
          <button className="ghost-button" type="button" onClick={redoDraft} disabled={!historyFuture.length}>
            Redo
          </button>
          <button className="ghost-button" type="button" onClick={() => onSaveCanvasAsTemplate(draft)}>
            Save board as template
          </button>
          <button className="ghost-button" type="button" onClick={() => onExportCanvasBoard(draft)}>
            Export board
          </button>
        </div>
      </div>

      {recoveryDraft ? (
        <div className="artifact-note">
          <strong>Recovered local draft available</strong>
          <span>A newer unsaved local board draft was found for this canvas.</span>
          <div className="hero__actions hero__actions--tight">
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setDraft(recoveryDraft);
                setRecoveryDraft(null);
                setHistoryPast([]);
                setHistoryFuture([]);
              }}
            >
              Restore local draft
            </button>
            <button
              className="ghost-button"
              type="button"
              onClick={() => {
                setRecoveryDraft(null);
                if (typeof window !== "undefined" && localDraftKey) {
                  window.localStorage.removeItem(localDraftKey);
                }
              }}
            >
              Discard local draft
            </button>
          </div>
        </div>
      ) : null}

      <div className="canvas-template-row">
        <span className="eyebrow">Templates</span>
        <div className="hero__actions hero__actions--tight">
          {CANVAS_TEMPLATES.map((template) => (
            <button key={template.id} className="ghost-button" type="button" onClick={() => onCreateCanvasFromTemplate(template.id)}>
              {template.label} ({template.category})
            </button>
          ))}
        </div>
      </div>

      {templates.length ? (
        <div className="canvas-template-library">
          {templates.map((template) => (
            <div key={template.id} className="canvas-template-card">
              <div>
                <strong>{template.name}</strong>
                <span>{template.description || "Reusable user template"}</span>
                <span>
                  {(template.metadata?.template_category || "general")} • {(template.metadata?.preferred_lane || currentLane)}
                </span>
                {template.metadata?.tags?.length ? <span>{template.metadata.tags.join(", ")}</span> : null}
              </div>
              <MiniBoardPreview canvas={template} title="Template preview" />
              <div className="hero__actions hero__actions--tight">
                <button className="secondary-button" type="button" onClick={() => onCreateCanvasFromSavedTemplate(template)}>
                  Use
                </button>
                <button className="ghost-button" type="button" onClick={() => onUpdateCanvasTemplateFromCanvas(template, draft)}>
                  Update
                </button>
                <button className="ghost-button" type="button" onClick={() => onDeleteCanvasTemplate(template)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

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

      <div className="canvas-metrics">
        <BoardStat label="Cards" value={draft.cards.length} />
        <BoardStat label="Links" value={draft.edges.length} />
        <BoardStat label="Groups" value={draft.cards.filter((card) => card.type === "group").length} />
        <BoardStat label="Selected file" value={selectedFile ? selectedFile.label : "None"} />
      </div>

      <label className="checkbox-field">
        <input type="checkbox" checked={autoSaveEnabled} onChange={(event) => setAutoSaveEnabled(event.target.checked)} />
        <span>Autosave board after changes settle.</span>
      </label>

      <div className="canvas-scope-bar">
        <div>
          <span className="eyebrow">Current board scope</span>
          <strong>{currentScope.label}</strong>
          <span className="microcopy">
            {currentScope.selected_files.length} file{currentScope.selected_files.length === 1 ? "" : "s"} in scope
            {selectedCards.length > 1
              ? ` from ${selectedCards.length} selected cards`
              : selectedCard
                ? ` from the selected ${selectedCard.type} card`
                : " from the whole board"}.
          </span>
          <span className="microcopy">{currentScope.why_summary}</span>
          <span className="microcopy">
            Scope health: {scopeHealth.passedCount}/{scopeHealth.totalCount} checks ready for Build review.
          </span>
        </div>
        <div className="hero__actions hero__actions--tight">
          <button
            className="secondary-button"
            type="button"
            onClick={() => onRunLogicScope(currentScope)}
            disabled={!currentScope.selected_files.length}
          >
            Run logic on this
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => onExplainScope(currentScope)}
            disabled={!currentScope.selected_files.length}
          >
            Explain this scope
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => onUseScopeInBuild(currentScope)}
            disabled={!currentScope.selected_files.length}
          >
            Use in Build
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() => onCreatePatchPreviewScope(currentScope)}
            disabled={!currentScope.selected_files.length}
          >
            Patch preview now
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() => onSaveScope(currentScope)}
            disabled={!currentScope.selected_files.length}
          >
            Save scope
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() => onSaveScopeAsPreset(currentScope)}
            disabled={!currentScope.selected_files.length}
          >
            Save scope as Build preset
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={exportScopePacket}
            disabled={!currentScope.selected_files.length}
          >
            Export scope packet
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() => onPromoteScope(currentScope, "memory")}
            disabled={!currentScope.selected_files.length}
          >
            Promote to Memory
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() => onPromoteScope(currentScope, "decision")}
            disabled={!currentScope.selected_files.length}
          >
            Promote to Decision
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() => onPromoteScope(currentScope, "topic")}
            disabled={!currentScope.selected_files.length}
          >
            Promote to Topic
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() => onPromoteScope(currentScope, "task")}
            disabled={!currentScope.selected_files.length}
          >
            Promote to Task
          </button>
        </div>
      </div>

      <div className="canvas-workbench">
        <section className="canvas-stage-panel">
          <div className="canvas-stage-toolbar">
            <div className="canvas-stage-toolbar__group">
              <button
                className={`ghost-button ${interactionMode === "pan" ? "graph-mode-button--active" : ""}`}
                type="button"
                onClick={() => setInteractionMode("pan")}
              >
                Pan mode
              </button>
              <button
                className={`ghost-button ${interactionMode === "lasso" ? "graph-mode-button--active" : ""}`}
                type="button"
                onClick={() => setInteractionMode("lasso")}
              >
                Lasso mode
              </button>
              <button className="ghost-button" type="button" onClick={() => patchDraft((current) => ({ ...current, viewport: { ...current.viewport, zoom: clamp(current.viewport.zoom - 0.1, MIN_ZOOM, MAX_ZOOM) } }))}>
                Zoom out
              </button>
              <button className="ghost-button" type="button" onClick={() => patchDraft((current) => ({ ...current, viewport: { ...current.viewport, zoom: clamp(current.viewport.zoom + 0.1, MIN_ZOOM, MAX_ZOOM) } }))}>
                Zoom in
              </button>
              <button className="ghost-button" type="button" onClick={recenterCanvas}>
                Center board
              </button>
              {selectedCards.length > 1 ? (
                <>
                  <button className="ghost-button" type="button" onClick={() => alignSelected("left")}>
                    Align left
                  </button>
                  <button className="ghost-button" type="button" onClick={() => alignSelected("center")}>
                    Align center
                  </button>
                  <button className="ghost-button" type="button" onClick={() => alignSelected("right")}>
                    Align right
                  </button>
                  <button className="ghost-button" type="button" onClick={() => alignSelected("top")}>
                    Align top
                  </button>
                  <button className="ghost-button" type="button" onClick={() => alignSelected("middle")}>
                    Align middle
                  </button>
                  <button className="ghost-button" type="button" onClick={() => alignSelected("bottom")}>
                    Align bottom
                  </button>
                </>
              ) : null}
            </div>
            <div className="canvas-stage-toolbar__group">
              <span className="microcopy">{Math.round(draft.viewport.zoom * 100)}% zoom</span>
              {linkingFromId ? (
                <button className="secondary-button" type="button" onClick={() => setLinkingFromId("")}>
                  Cancel link
                </button>
              ) : (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setLinkingFromId(selectedCard?.id || "")}
                  disabled={!selectedCard}
                >
                  Link selected card
                </button>
              )}
            </div>
          </div>

          <div
            ref={stageRef}
            className="canvas-stage"
            onPointerDown={startStageInteraction}
            onPointerMove={onPointerMove}
            onPointerUp={stopPointerWork}
            onPointerLeave={stopPointerWork}
            onWheel={onWheel}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const raw = event.dataTransfer.getData("application/context-vault-file");
              if (!raw) {
                return;
              }
              try {
                const file = JSON.parse(raw);
                const stageRect = stageRef.current?.getBoundingClientRect();
                if (!stageRect) {
                  return;
                }
                const point = boardPoint(stageRect, draft.viewport, event.clientX, event.clientY);
                addFileCardAt(file, point.x - 160, point.y - 90);
              } catch {
                // Ignore malformed drag payloads.
              }
            }}
          >
            <div
              className="canvas-surface"
              style={{
                width: `${SURFACE_WIDTH}px`,
                height: `${SURFACE_HEIGHT}px`,
                transform: `translate(${draft.viewport.x}px, ${draft.viewport.y}px) scale(${draft.viewport.zoom})`,
              }}
            >
              <svg className="canvas-surface__edges" viewBox={`0 0 ${SURFACE_WIDTH} ${SURFACE_HEIGHT}`}>
                <defs>
                  {Object.entries(COLOR_META).map(([color, meta]) => (
                    <marker
                      key={color}
                      id={`canvas-arrow-${color}`}
                      viewBox="0 0 10 10"
                      refX="9"
                      refY="5"
                      markerWidth="8"
                      markerHeight="8"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill={meta.line} />
                    </marker>
                  ))}
                </defs>
                {(draft.edges || []).map((edge) => {
                  const fromCard = cardMap.get(edge.from_card);
                  const toCard = cardMap.get(edge.to_card);
                  if (!fromCard || !toCard) {
                    return null;
                  }
                  const centerFrom = cardCenter(fromCard);
                  const centerTo = cardCenter(toCard);
                  const dx = centerTo.x - centerFrom.x;
                  const dy = centerTo.y - centerFrom.y;
                  const from = anchorForCard(fromCard, dx, dy);
                  const to = anchorForCard(toCard, -dx, -dy);
                  const meta = colorMeta(edge.color);
                  const labelX = (from.x + to.x) / 2;
                  const labelY = (from.y + to.y) / 2;
                  const controlOffset = Math.min(90, Math.max(24, Math.hypot(dx, dy) * 0.18));
                  const path = Math.abs(dx) >= Math.abs(dy)
                    ? `M ${from.x} ${from.y} C ${from.x + Math.sign(dx || 1) * controlOffset} ${from.y}, ${to.x - Math.sign(dx || 1) * controlOffset} ${to.y}, ${to.x} ${to.y}`
                    : `M ${from.x} ${from.y} C ${from.x} ${from.y + Math.sign(dy || 1) * controlOffset}, ${to.x} ${to.y - Math.sign(dy || 1) * controlOffset}, ${to.x} ${to.y}`;
                  return (
                    <g key={edge.id}>
                      <path
                        d={path}
                        stroke={meta.line}
                        strokeWidth={edge.label ? 3.4 : 2.6}
                        strokeLinecap="round"
                        fill="none"
                        markerEnd={`url(#canvas-arrow-${edge.color})`}
                        strokeDasharray={edge.label ? "0" : "5 5"}
                      />
                      {edge.label ? (
                        <>
                          <rect x={labelX - 52} y={labelY - 12} width="104" height="24" rx="12" fill="rgba(10, 13, 19, 0.86)" />
                          <text x={labelX} y={labelY + 4} textAnchor="middle" className="canvas-edge-label">
                            {edge.label}
                          </text>
                        </>
                      ) : null}
                    </g>
                  );
                })}
              </svg>

              {(draft.cards || []).map((card) => {
                const meta = colorMeta(card.color);
                const file = card.file_id ? fileLookup.get(card.file_id) : null;
                return (
                  <article
                    key={card.id}
                    className={`canvas-card canvas-card--${card.type} ${selectedCardIds.includes(card.id) ? "canvas-card--selected" : ""}`}
                    style={{
                      left: `${card.x}px`,
                      top: `${card.y}px`,
                      width: `${card.width}px`,
                      minHeight: `${card.height}px`,
                      background: meta.fill,
                      borderColor: meta.border,
                    }}
                    onPointerDown={(event) => handleCardClick(event, card)}
                  >
                    <div className="canvas-card__chrome">
                      <button className="canvas-card__handle" type="button" onPointerDown={(event) => startCardDrag(event, card)}>
                        Drag
                      </button>
                      <div className="canvas-card__actions">
                        {card.type === "file" && (file || card.path) ? (
                          <button className="ghost-button" type="button" onClick={() => onOpenFile(card)}>
                            Open
                          </button>
                        ) : null}
                        <button className="ghost-button" type="button" onClick={() => setLinkingFromId(card.id)}>
                          Link
                        </button>
                        <button className="ghost-button" type="button" onClick={() => removeCard(card.id)}>
                          Remove
                        </button>
                      </div>
                    </div>
                    <div className="canvas-card__body">
                      <span className="eyebrow">{card.type === "group" ? "Group" : card.type === "file" ? "File" : "Note"}</span>
                      <h4>{card.label}</h4>
                      {card.type === "file" ? (
                        <>
                          <p>{card.note || card.text || file?.summary || "Pinned file"}</p>
                          <code>{file?.rel_path || card.path}</code>
                        </>
                      ) : (
                        <p>{cardPreview(card)}</p>
                      )}
                    </div>
                    {!card.locked ? (
                      <button className="canvas-card__resize" type="button" onPointerDown={(event) => startResize(event, card)}>
                        Resize
                      </button>
                    ) : null}
                  </article>
                );
              })}
              {snapGuides.map((guide, index) => (
                <div
                  key={`${guide.orientation}-${guide.position}-${index}`}
                  className={`canvas-snap-guide canvas-snap-guide--${guide.orientation}`}
                  style={
                    guide.orientation === "vertical"
                      ? { left: `${guide.position}px` }
                      : { top: `${guide.position}px` }
                  }
                />
              ))}
              {selectionBox ? (
                <div
                  className="canvas-selection-box"
                  style={{
                    left: `${Math.min(selectionBox.startX, selectionBox.endX)}px`,
                    top: `${Math.min(selectionBox.startY, selectionBox.endY)}px`,
                    width: `${Math.abs(selectionBox.endX - selectionBox.startX)}px`,
                    height: `${Math.abs(selectionBox.endY - selectionBox.startY)}px`,
                  }}
                />
              ) : null}
            </div>
          </div>
        </section>

        <aside className="canvas-sidebar">
          <section className="canvas-sidebar__panel">
            <span className="eyebrow">Board map</span>
            <MiniBoardPreview
              canvas={draft}
              title="Current board"
              viewportInfo={currentViewportInfo}
              onNavigate={centerViewportOnBoardPoint}
            />
            <p className="microcopy">Use this minimap-style view to keep your bearings while zoomed in.</p>
          </section>

          <section className="canvas-sidebar__panel">
            <span className="eyebrow">Board states</span>
            {canvasSnapshots.length ? (
              <>
                <div className="canvas-file-tray">
                  {canvasSnapshots.slice(0, 6).map((snapshot) => (
                    <div key={snapshot.id} className="canvas-file-tray__item">
                      <div>
                        <strong>{snapshot.label}</strong>
                        <span>{snapshot.snapshot_bundle_label || snapshot.created_at}</span>
                      </div>
                      <button className="ghost-button" type="button" onClick={() => onRestoreCanvasSnapshot(snapshot.id)}>
                        Restore
                      </button>
                    </div>
                  ))}
                </div>
                {canvasSnapshots.length >= 2 ? (
                  <div className="canvas-state-compare">
                    <label>
                      <span>Compare left</span>
                      <select value={compareLeftSnapshotId} onChange={(event) => setCompareLeftSnapshotId(event.target.value)}>
                        <option value="">Choose board state</option>
                        {canvasSnapshots.map((snapshot) => (
                          <option key={snapshot.id} value={snapshot.id}>
                            {snapshot.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Compare right</span>
                      <select value={compareRightSnapshotId} onChange={(event) => setCompareRightSnapshotId(event.target.value)}>
                        <option value="">Choose board state</option>
                        {canvasSnapshots.map((snapshot) => (
                          <option key={snapshot.id} value={snapshot.id}>
                            {snapshot.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {canvasSnapshotComparison ? (
                      <div className="artifact-note">
                        <strong>
                          {canvasSnapshotComparison.added.length} added, {canvasSnapshotComparison.removed.length} removed
                        </strong>
                        <span>Moved: {canvasSnapshotComparison.moved.length}</span>
                        <span>Resized: {canvasSnapshotComparison.resized.length}</span>
                        <span>Edited: {canvasSnapshotComparison.edited.length}</span>
                        <span>Added cards: {canvasSnapshotComparison.addedLabels.slice(0, 6).join(", ") || "None"}</span>
                        <span>Removed cards: {canvasSnapshotComparison.removedLabels.slice(0, 6).join(", ") || "None"}</span>
                        <span>Moved cards: {canvasSnapshotComparison.movedLabels.slice(0, 6).join(", ") || "None"}</span>
                        <span>Edited cards: {canvasSnapshotComparison.editedLabels.slice(0, 6).join(", ") || "None"}</span>
                      </div>
                    ) : null}
                    {canvasSnapshotComparison ? (
                      <div className="canvas-compare-preview">
                        <MiniBoardPreview
                          canvas={compareLeftSnapshot.content?.canvas || {}}
                          statusMap={compareLeftStatusMap}
                          title={compareLeftSnapshot.label}
                        />
                        <MiniBoardPreview
                          canvas={compareRightSnapshot.content?.canvas || {}}
                          statusMap={compareRightStatusMap}
                          title={compareRightSnapshot.label}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="empty-copy">No saved board states yet.</p>
            )}
          </section>

          <section className="canvas-sidebar__panel">
            <span className="eyebrow">Since last state</span>
            {latestBoardSnapshot && latestBoardDelta ? (
              <div className="artifact-note">
                <strong>{latestBoardSnapshot.label}</strong>
                <span>Added cards: {latestBoardDelta.added.length}</span>
                <span>Removed cards: {latestBoardDelta.removed.length}</span>
                <span>Moved cards: {latestBoardDelta.moved.length}</span>
                <span>Edited cards: {latestBoardDelta.edited.length}</span>
                <span>Link delta: {latestBoardDelta.changedLinks}</span>
              </div>
            ) : (
              <p className="empty-copy">Save a board state to track how the current board is changing.</p>
            )}
          </section>

          <section className="canvas-sidebar__panel">
            <span className="eyebrow">Latest build</span>
            {linkedBoardPatchPreview || linkedBoardApplyRun ? (
              <div className="artifact-note">
                {linkedBoardPatchPreview ? (
                  <>
                    <strong>{linkedBoardPatchPreview.label}</strong>
                    <span>
                      Patch preview: {linkedBoardPatchPreview.selected_file_count || 0} files, {linkedBoardPatchPreview.error_count || 0} errors, {linkedBoardPatchPreview.warning_count || 0} warnings
                    </span>
                  </>
                ) : null}
                {linkedBoardApplyRun ? (
                  <span>
                    Latest apply: {linkedBoardApplyRun.label} with {linkedBoardApplyRun.selected_file_count || 0} scoped files
                  </span>
                ) : null}
                <div className="hero__actions hero__actions--tight">
                  <button className="ghost-button" type="button" onClick={() => onUseScopeInBuild(currentScope)} disabled={!currentScope.selected_files.length}>
                    Open in Build
                  </button>
                </div>
              </div>
            ) : (
              <p className="empty-copy">No board-linked patch preview or apply run yet.</p>
            )}
          </section>

          <section className="canvas-sidebar__panel">
            <span className="eyebrow">Board activity</span>
            {boardTimeline.length ? (
              <div className="compact-list compact-list--tight">
                {boardTimeline.map((item) => (
                  <div key={`${item.kind}-${item.id}`} className="canvas-edge-row">
                    <div>
                      <strong>{item.label}</strong>
                      <span>{item.kind}</span>
                    </div>
                    <div>
                      <span className="microcopy">
                        {item.summary?.scope_label || item.summary?.canvas_label || item.created_at}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-copy">No board-linked history yet. Save a scope, board state, or patch preview from this canvas.</p>
            )}
          </section>

          <section className="canvas-sidebar__panel">
            <span className="eyebrow">File tray</span>
            <label>
              <span>Find file to pin</span>
              <input value={trayQuery} onChange={(event) => setTrayQuery(event.target.value)} placeholder="Search recent or bookmarked files" />
            </label>
            <div className="canvas-file-tray">
              {trayFiles.length ? (
                trayFiles.map((file) => (
                  <div
                    key={file.id}
                    className="canvas-file-tray__item"
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("application/context-vault-file", JSON.stringify(file));
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                  >
                    <div>
                      <strong>{file.label}</strong>
                      <span>{file.rel_path}</span>
                    </div>
                    <button className="ghost-button" type="button" onClick={() => addFileCardAt(file)}>
                      Add
                    </button>
                  </div>
                ))
              ) : (
                <p className="empty-copy">No tray files match that search yet.</p>
              )}
            </div>
          </section>

          <section className="canvas-sidebar__panel">
            <span className="eyebrow">Board</span>
            <h3>{draft.name}</h3>
            <label>
              <span>Board name</span>
              <input
                value={draft.name}
                onChange={(event) => patchDraft((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <label>
              <span>Description</span>
              <textarea
                rows="4"
                value={draft.description}
                onChange={(event) => patchDraft((current) => ({ ...current, description: event.target.value }))}
                placeholder="What is this board trying to capture?"
              />
            </label>
            <div className="artifact-note">
              <strong>Review state</strong>
              <span>{draft.metadata.review_status || "draft"}</span>
              <span>{draft.metadata.last_reviewed_at || "Not reviewed yet"}</span>
            </div>
            <div className="artifact-note">
              <strong>Preferred lane</strong>
              <span>{draft.metadata.preferred_lane || currentLane}</span>
              <span>{draft.metadata.template_category || "general"}</span>
              <span>{draft.metadata.tags?.join(", ") || "No tags yet"}</span>
            </div>
          </section>

          <section className="canvas-sidebar__panel">
            <span className="eyebrow">Workflow</span>
            <label>
              <span>Preferred lane</span>
              <select value={draft.metadata.preferred_lane} onChange={(event) => updateBoardMetadata("preferred_lane", event.target.value)}>
                <option value="structure">Structure</option>
                <option value="digital-brain">Digital Brain</option>
              </select>
            </label>
            <label>
              <span>Template category</span>
              <input
                value={draft.metadata.template_category}
                onChange={(event) => updateBoardMetadata("template_category", event.target.value)}
                placeholder="architecture, build, research"
              />
            </label>
            <label>
              <span>Board workflow</span>
              <select value={draft.metadata.workflow} onChange={(event) => updateBoardMetadata("workflow", event.target.value)}>
                {CANVAS_TEMPLATES.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Board tags</span>
              <input
                value={(draft.metadata.tags || []).join(", ")}
                onChange={(event) =>
                  updateBoardMetadata(
                    "tags",
                    event.target.value.split(",").map((item) => item.trim()).filter(Boolean),
                  )
                }
                placeholder="architecture, handoff, validation"
              />
            </label>
            <label>
              <span>Board build goal</span>
              <textarea
                rows="4"
                value={draft.metadata.build_goal}
                onChange={(event) => updateBoardMetadata("build_goal", event.target.value)}
                placeholder="What should Build accomplish from this board?"
              />
            </label>
            <label>
              <span>Allowed build targets</span>
              <textarea
                rows="3"
                value={joinLines(draft.metadata.allowed_targets)}
                onChange={(event) => updateBoardMetadata("allowed_targets", splitLines(event.target.value))}
                placeholder={"/absolute/target/or/folder\nsrc/module.py"}
              />
            </label>
            <label>
              <span>Forbidden paths</span>
              <textarea
                rows="3"
                value={joinLines(draft.metadata.forbidden_paths)}
                onChange={(event) => updateBoardMetadata("forbidden_paths", splitLines(event.target.value))}
                placeholder={"secrets/\nprivate.key"}
              />
            </label>
            <label>
              <span>Snapshot milestone label</span>
              <input
                value={draft.metadata.snapshot_label}
                onChange={(event) => updateBoardMetadata("snapshot_label", event.target.value)}
                placeholder="Architecture review milestone"
              />
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={draft.metadata.auto_snapshot_on_save}
                onChange={(event) => updateBoardMetadata("auto_snapshot_on_save", event.target.checked)}
              />
              <span>Create a board-state snapshot after manual save.</span>
            </label>
            <label>
              <span>Review notes</span>
              <textarea
                rows="4"
                value={draft.metadata.review_notes}
                onChange={(event) => updateBoardMetadata("review_notes", event.target.value)}
                placeholder="Open risks, missing evidence, or handoff notes"
              />
            </label>
            <div className="hero__actions hero__actions--tight">
              <button className="secondary-button" type="button" onClick={finalizeBoardReview}>
                Finalize review
              </button>
              <button className="ghost-button" type="button" onClick={() => onUseScopeInBuild(currentScope)} disabled={!currentScope.selected_files.length}>
                Use reviewed scope in Build
              </button>
            </div>
            <div className="artifact-note">
              <strong>Pre-Build review</strong>
              {scopeHealth.checks.map((item) => (
                <span key={item.id}>{item.pass ? "Ready" : "Missing"}: {item.label}</span>
              ))}
            </div>
          </section>

          <section className="canvas-sidebar__panel">
            <span className="eyebrow">Digital Brain links</span>
            {linkedBoardRecords.length ? (
              <div className="compact-list compact-list--tight">
                {linkedBoardRecords.map((record) => (
                  <div key={record.id} className="canvas-edge-row">
                    <div>
                      <strong>{record.title}</strong>
                      <span>{record.kind}</span>
                    </div>
                    <div className="hero__actions hero__actions--tight">
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => onOpenDigitalBrainRecord?.(record)}
                      >
                        Open
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-copy">No Digital Brain records are linked to this board yet.</p>
            )}
          </section>

          <section className="canvas-sidebar__panel">
            <span className="eyebrow">Selected card</span>
            {selectedCards.length > 1 ? (
              <div className="canvas-empty-inspector">
                <p>{selectedCards.length} cards selected.</p>
                <p>The current scope actions will use all selected cards together.</p>
                <div className="hero__actions hero__actions--tight">
                  <button className="secondary-button" type="button" onClick={duplicateSelectedCard}>
                    Duplicate selection
                  </button>
                  <button className="ghost-button" type="button" onClick={() => setSelectedCardIds([])}>
                    Clear selection
                  </button>
                </div>
              </div>
            ) : selectedCard ? (
              <div className="canvas-inspector">
                <label>
                  <span>Title</span>
                  <input value={selectedCard.label} onChange={(event) => updateCard(selectedCard.id, "label", event.target.value)} />
                </label>
                <label>
                  <span>Card color</span>
                  <select value={selectedCard.color} onChange={(event) => updateCard(selectedCard.id, "color", event.target.value)}>
                    {Object.keys(COLOR_META).map((color) => (
                      <option key={color} value={color}>
                        {color}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={selectedCard.locked}
                    onChange={(event) => updateCard(selectedCard.id, "locked", event.target.checked)}
                  />
                  <span>Lock card position and size</span>
                </label>
                {selectedCard.type === "file" ? (
                  <>
                    <label>
                      <span>Working note</span>
                      <textarea
                        rows="5"
                        value={selectedCard.note}
                        onChange={(event) => updateCard(selectedCard.id, "note", event.target.value)}
                        placeholder="Why this file matters on this board"
                      />
                    </label>
                    <div className="artifact-note">
                      <strong>Bound file</strong>
                      <span>{selectedCard.path || "No path saved"}</span>
                    </div>
                  </>
                ) : (
                  <label>
                    <span>{selectedCard.type === "group" ? "Group note" : "Card text"}</span>
                    <textarea
                      rows={selectedCard.type === "group" ? 6 : 8}
                      value={selectedCard.type === "group" ? selectedCard.note : selectedCard.text}
                      onChange={(event) =>
                        updateCard(selectedCard.id, selectedCard.type === "group" ? "note" : "text", event.target.value)
                      }
                    />
                  </label>
                )}
                <div className="canvas-dimension-row">
                  <label>
                    <span>Width</span>
                    <input
                      type="number"
                      min="220"
                      value={Math.round(selectedCard.width)}
                      onChange={(event) => updateCard(selectedCard.id, "width", Number(event.target.value) || selectedCard.width)}
                    />
                  </label>
                  <label>
                    <span>Height</span>
                    <input
                      type="number"
                      min="160"
                      value={Math.round(selectedCard.height)}
                      onChange={(event) => updateCard(selectedCard.id, "height", Number(event.target.value) || selectedCard.height)}
                    />
                  </label>
                </div>
                <div className="hero__actions hero__actions--tight">
                  <button className="secondary-button" type="button" onClick={duplicateSelectedCard}>
                    Duplicate card
                  </button>
                  {selectedCard.type === "file" ? (
                    <button className="ghost-button" type="button" onClick={() => onOpenFile(selectedCard)}>
                      Open in notes
                    </button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="canvas-empty-inspector">
                <p>Select a card to edit its content, size, color, and links.</p>
                <p>If you want to add a file card, pick a file in Notes or Graph first, then come back and use <strong>Add selected file</strong>.</p>
              </div>
            )}
          </section>

          <section className="canvas-sidebar__panel">
            <span className="eyebrow">Links</span>
            {linkedEdges.length ? (
              <div className="compact-list compact-list--tight">
                {linkedEdges.map((edge) => {
                  const fromCard = cardMap.get(edge.from_card);
                  const toCard = cardMap.get(edge.to_card);
                  return (
                    <div key={edge.id} className="canvas-edge-row">
                      <div>
                        <strong>{fromCard?.label || "Missing card"} → {toCard?.label || "Missing card"}</strong>
                        <span>{edge.label || "Unlabeled connection"}</span>
                      </div>
                      <div className="canvas-edge-editor">
                        <input
                          value={edge.label}
                          onChange={(event) => updateEdge(edge.id, "label", event.target.value)}
                          placeholder="Edge label"
                        />
                        <select value={edge.color} onChange={(event) => updateEdge(edge.id, "color", event.target.value)}>
                          {Object.keys(COLOR_META).map((color) => (
                            <option key={color} value={color}>
                              {color}
                            </option>
                          ))}
                        </select>
                        <button className="ghost-button" type="button" onClick={() => removeEdge(edge.id)}>
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="canvas-empty-inspector">
                <p>No links on the current selection yet.</p>
                <p>Select a card, press <strong>Link selected card</strong>, then click another card on the board.</p>
              </div>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}
