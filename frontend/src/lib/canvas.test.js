import { describe, expect, test } from "vitest";

import { buildSavedScopeComparison, normalizeCanvasMetadata } from "./canvas";


describe("normalizeCanvasMetadata", () => {
  test("fills defaults and deduplicates list fields", () => {
    expect(
      normalizeCanvasMetadata({
        workflow: "build-plan",
        preferred_lane: "digital-brain",
        template_category: "planning",
        tags: ["build", "build", "", "review"],
        allowed_targets: ["src", "src", "", "tests"],
        forbidden_paths: ["secrets", "secrets"],
      }),
    ).toEqual({
      workflow: "build-plan",
      preferred_lane: "digital-brain",
      template_category: "planning",
      tags: ["build", "review"],
      build_goal: "",
      allowed_targets: ["src", "tests"],
      forbidden_paths: ["secrets"],
      auto_snapshot_on_save: false,
      snapshot_label: "",
      review_notes: "",
      review_status: "draft",
      last_reviewed_at: "",
    });
  });
});


describe("buildSavedScopeComparison", () => {
  test("compares files, cards, and workflow deltas", () => {
    const comparison = buildSavedScopeComparison(
      {
        metadata: {
          selected_files: ["README.md", "docs/ARCH.md"],
          selected_card_labels: ["Core docs", "Risk note"],
          note_card_count: 1,
          group_card_count: 1,
          link_count: 2,
          build_goal: "Document the current state",
          allowed_targets: ["docs"],
          forbidden_paths: ["secrets"],
        },
      },
      {
        metadata: {
          selected_files: ["README.md", "docs/API.md"],
          selected_card_labels: ["Core docs", "API note", "Validation"],
          note_card_count: 2,
          group_card_count: 1,
          link_count: 4,
          build_goal: "Document the current state and next steps",
          allowed_targets: ["docs", "frontend"],
          forbidden_paths: [],
        },
      },
    );

    expect(comparison.added).toEqual(["docs/API.md"]);
    expect(comparison.removed).toEqual(["docs/ARCH.md"]);
    expect(comparison.shared).toEqual(["README.md"]);
    expect(comparison.addedCards).toEqual(["API note", "Validation"]);
    expect(comparison.removedCards).toEqual(["Risk note"]);
    expect(comparison.noteCardDelta).toBe(1);
    expect(comparison.linkDelta).toBe(2);
    expect(comparison.buildGoalChanged).toBe(true);
    expect(comparison.allowedTargetDelta).toBe(1);
    expect(comparison.forbiddenPathDelta).toBe(-1);
  });
});
