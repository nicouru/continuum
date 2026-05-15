import { describe, expect, it } from "vitest"
import {
  createEmptyStructuredNoteDraft,
  getStructuredNoteDraftWarnings,
  normalizeStructuredNoteDraft,
} from "./index"

describe("StructuredNoteDraft validation", () => {
  it("normalizes minimal payloads", () => {
    const draft = normalizeStructuredNoteDraft(createEmptyStructuredNoteDraft())
    expect(draft.blocks.length).toBeGreaterThan(0)
    expect(draft.source.kind).toBe("structuredNoteDraft")
  })

  it("warns about unresolved citations", () => {
    const draft = normalizeStructuredNoteDraft({
      ...createEmptyStructuredNoteDraft(),
      citations: [
        {
          anchor: {
            blockId: "draft-block-1",
            segmentId: "draft-segment-1",
          },
          id: "c1",
          noteId: "draft-note-1",
        },
      ],
    })

    const warnings = getStructuredNoteDraftWarnings({
      blocks: draft.blocks,
      citations: draft.citations,
      references: draft.references,
    })

    expect(warnings.some((warning) => warning.code === "unresolved-citation")).toBe(true)
  })
})
