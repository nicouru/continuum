import { describe, expect, it } from "vitest"
import { normalizeStructuredNoteDraft } from "@continuum/core"
import {
  createStructuredDraftFromTipTapPrototypeDocument,
  createTipTapPrototypeDocumentFromStructuredDraft,
} from "./tiptap-document"

describe("TipTap structured draft roundtrip", () => {
  it("preserves structural ids across conversions", () => {
    const seed = normalizeStructuredNoteDraft({
      aphorisms: [],
      blocks: [
        {
          aphorismId: "aph-1",
          aphorismMarker: { countsInSequence: true, value: "I" },
          id: "blk-p1",
          segments: [{ id: "seg-a", text: "Hola", type: "text" }],
          type: "paragraph",
        },
        {
          id: "blk-ref",
          referenceId: "ref-1",
          referenceInsertId: "blk-ref",
          text: "Quote body",
          type: "referenceInsert",
        },
        {
          id: "blk-p2",
          segments: [
            { id: "seg-m", tex: "x^2", type: "inlineMath" },
            { id: "seg-i", type: "manualIndent" },
            { citationId: "cit-1", id: "seg-t", text: "cita", type: "text" },
          ],
          type: "paragraph",
        },
      ],
      citations: [
        {
          anchor: {
            aphorismId: "aph-1",
            blockId: "blk-p2",
            offset: 0,
            segmentId: "seg-t",
            selectedText: "cita",
          },
          id: "cit-1",
          noteId: "note-test",
          referenceId: "ref-1",
        },
      ],
      id: "note-test",
      persistence: { safeForCurrentNoteModel: true, unsupportedFeatures: [] },
      references: [
        {
          author: "Author",
          body: "",
          id: "ref-1",
          work: "Work",
        },
      ],
      source: { kind: "structuredNoteDraft", version: 1 },
      title: "",
      warnings: [],
      writtenAt: "2026-05-15",
    })

    const prototype = createTipTapPrototypeDocumentFromStructuredDraft(seed)
    const restored = normalizeStructuredNoteDraft(
      createStructuredDraftFromTipTapPrototypeDocument({
        sourceDraft: seed,
        tiptap: prototype.tiptap,
      }),
    )

    expect(restored.blocks.map((block) => block.id)).toEqual(seed.blocks.map((b) => b.id))
    expect(restored.citations.map((citation) => citation.id)).toEqual(
      seed.citations.map((c) => c.id),
    )
    expect(restored.references.map((reference) => reference.id)).toEqual(
      seed.references.map((r) => r.id),
    )
  })
})
