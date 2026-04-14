export const DEFAULT_CANVAS_METADATA = {
  workflow: "research-synthesis",
  preferred_lane: "structure",
  template_category: "general",
  tags: [],
  build_goal: "",
  allowed_targets: [],
  forbidden_paths: [],
  auto_snapshot_on_save: false,
  snapshot_label: "",
  review_notes: "",
  review_status: "draft",
  last_reviewed_at: "",
};


function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}


export function normalizeCanvasMetadata(metadata = {}) {
  return {
    ...DEFAULT_CANVAS_METADATA,
    ...metadata,
    tags: unique(metadata.tags),
    allowed_targets: unique(metadata.allowed_targets),
    forbidden_paths: unique(metadata.forbidden_paths),
  };
}


export function buildSavedScopeComparison(leftScope = {}, rightScope = {}) {
  const leftMeta = leftScope.metadata || {};
  const rightMeta = rightScope.metadata || {};
  const leftFiles = new Set(leftMeta.selected_files || []);
  const rightFiles = new Set(rightMeta.selected_files || []);
  const leftCards = new Set(leftMeta.selected_card_labels || []);
  const rightCards = new Set(rightMeta.selected_card_labels || []);

  const added = [...rightFiles].filter((item) => !leftFiles.has(item)).sort();
  const removed = [...leftFiles].filter((item) => !rightFiles.has(item)).sort();
  const shared = [...rightFiles].filter((item) => leftFiles.has(item)).sort();
  const addedCards = [...rightCards].filter((item) => !leftCards.has(item)).sort();
  const removedCards = [...leftCards].filter((item) => !rightCards.has(item)).sort();

  return {
    added,
    removed,
    shared,
    addedCards,
    removedCards,
    noteCardDelta: Number(rightMeta.note_card_count || 0) - Number(leftMeta.note_card_count || 0),
    groupCardDelta: Number(rightMeta.group_card_count || 0) - Number(leftMeta.group_card_count || 0),
    linkDelta: Number(rightMeta.link_count || 0) - Number(leftMeta.link_count || 0),
    cardCountDelta: Number(rightMeta.card_count || 0) - Number(leftMeta.card_count || 0),
    buildGoalChanged: (leftMeta.build_goal || "") !== (rightMeta.build_goal || ""),
    allowedTargetDelta:
      unique(rightMeta.allowed_targets).length - unique(leftMeta.allowed_targets).length,
    forbiddenPathDelta:
      unique(rightMeta.forbidden_paths).length - unique(leftMeta.forbidden_paths).length,
  };
}
