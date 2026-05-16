import { describe, expect, it } from "vitest"
import {
  createEmptyStructuredNoteDraft,
  normalizeStructuredNoteDraft,
} from "@continuum/core"
import {
  createStructuredDraftFromTipTapPrototypeDocument,
  createTipTapPrototypeDocumentFromStructuredDraft,
} from "./tiptap-document"
import type { TipTapJsonNode } from "./tiptap-types"

describe("TipTap structured draft roundtrip", () => {
  it("keeps a new empty draft to one editable block", () => {
    const seed = normalizeStructuredNoteDraft(
      createEmptyStructuredNoteDraft("2026-05-15T00:00:00.000Z"),
    )

    const prototype = createTipTapPrototypeDocumentFromStructuredDraft(seed)
    const [firstNode] = prototype.tiptap.content ?? []

    expect(prototype.tiptap.content).toHaveLength(1)
    expect(firstNode?.type).toBe("structuredParagraph")

    const restored = createStructuredDraftFromTipTapPrototypeDocument({
      sourceDraft: seed,
      tiptap: prototype.tiptap,
    })

    expect(restored.blocks).toHaveLength(1)
    expect(restored.blocks[0]?.id).toBe("draft-block-1")
  })

  it("treats TipTap trailing empty paragraphs as editor-only structure", () => {
    const seed = normalizeStructuredNoteDraft(
      createEmptyStructuredNoteDraft("2026-05-15T00:00:00.000Z"),
    )
    const prototype = createTipTapPrototypeDocumentFromStructuredDraft(seed)
    const tiptapWithTrailingParagraph: TipTapJsonNode = {
      ...prototype.tiptap,
      content: [...(prototype.tiptap.content ?? []), { type: "paragraph" }],
    }

    const restored = createStructuredDraftFromTipTapPrototypeDocument({
      sourceDraft: seed,
      tiptap: tiptapWithTrailingParagraph,
    })

    expect(restored.blocks).toHaveLength(1)
    expect(restored.blocks[0]?.id).toBe("draft-block-1")
  })

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

  it("preserves structured content, labels and reference insert metadata", () => {
    const seed = normalizeStructuredNoteDraft({
      aphorisms: [
        {
          blockIds: ["blk-aph-1"],
          id: "aph-1",
          marker: { countsInSequence: true, value: "I" },
          noteId: "note-complex",
        },
      ],
      blocks: [
        {
          aphorismId: "aph-1",
          aphorismMarker: { countsInSequence: true, value: "I" },
          id: "blk-aph-1",
          segments: [
            { id: "seg-aph-text", text: "Aphorism body", type: "text" },
            { id: "seg-aph-indent", type: "manualIndent" },
            { id: "seg-aph-math", tex: "x^2", type: "inlineMath" },
          ],
          type: "paragraph",
        },
        {
          id: "blk-ref-insert",
          referenceId: "ref-1",
          referenceInsertId: "insert-1",
          sourceFragmentFingerprint: "fragment-abc",
          sourceVersionId: "version-1",
          text: "Quoted reference body",
          type: "referenceInsert",
        },
        {
          id: "blk-cited",
          segments: [
            { id: "seg-before", text: "Before ", type: "text" },
            { citationId: "cit-1", id: "seg-cited", text: "cited", type: "text" },
          ],
          type: "paragraph",
        },
      ],
      citations: [
        {
          anchor: {
            blockId: "blk-cited",
            offset: 7,
            segmentId: "seg-cited",
            selectedText: "cited",
          },
          id: "cit-1",
          noteId: "note-complex",
          referenceId: "ref-1",
        },
      ],
      id: "note-complex",
      persistence: { safeForCurrentNoteModel: true, unsupportedFeatures: [] },
      references: [
        {
          author: "Author",
          body: "Reference body",
          id: "ref-1",
          work: "Work",
        },
      ],
      source: { kind: "structuredNoteDraft", version: 1 },
      title: "Complex note",
      warnings: [],
      writtenAt: "2026-05-15",
    })

    const prototype = createTipTapPrototypeDocumentFromStructuredDraft(seed)
    const [aphorismNode, referenceInsertNode, citedNode] =
      prototype.tiptap.content ?? []

    expect(aphorismNode?.attrs?.visibleLabel).toBe("I")
    expect(referenceInsertNode?.attrs).toMatchObject({
      blockId: "blk-ref-insert",
      referenceId: "ref-1",
      referenceInsertId: "insert-1",
      referenceLabel: "Author, Work",
      sourceFragmentFingerprint: "fragment-abc",
      sourceVersionId: "version-1",
    })

    const citedTextNode = citedNode?.content?.find(
      (node) => node.type === "text" && node.text === "cited",
    )
    expect(citedTextNode?.marks?.find((mark) => mark.type === "citation")?.attrs).toMatchObject({
      citationId: "cit-1",
      referenceId: "ref-1",
      visibleNumber: "1",
    })

    const restored = createStructuredDraftFromTipTapPrototypeDocument({
      sourceDraft: seed,
      tiptap: prototype.tiptap,
    })

    expect(restored.persistence.safeForCurrentNoteModel).toBe(true)
    expect(restored.warnings).toEqual([])
    expect(restored.blocks).toEqual(seed.blocks)
    expect(restored.citations).toEqual(seed.citations)
    expect(restored.references).toEqual(seed.references)
  })

  it("keeps one citation when a marked selection is split across text nodes", () => {
    const sourceDraft = normalizeStructuredNoteDraft({
      blocks: [],
      citations: [],
      id: "note-split-citation",
      references: [{ body: "Reference body", id: "ref-1" }],
      title: "",
      writtenAt: "2026-05-15",
    })
    const tiptap: TipTapJsonNode = {
      content: [
        {
          attrs: { blockId: "blk-1" },
          content: [
            {
              marks: [
                { attrs: { segmentId: "seg-1" }, type: "segment" },
                {
                  attrs: {
                    anchorOffset: 0,
                    citationId: "cit-1",
                    referenceId: "ref-1",
                  },
                  type: "citation",
                },
              ],
              text: "first ",
              type: "text",
            },
            {
              marks: [
                { attrs: { segmentId: "seg-2" }, type: "segment" },
                {
                  attrs: {
                    anchorOffset: 0,
                    citationId: "cit-1",
                    referenceId: "ref-1",
                  },
                  type: "citation",
                },
              ],
              text: "second",
              type: "text",
            },
          ],
          type: "structuredParagraph",
        },
      ],
      type: "doc",
    }

    const restored = createStructuredDraftFromTipTapPrototypeDocument({
      sourceDraft,
      tiptap,
    })

    expect(restored.citations).toHaveLength(1)
    expect(restored.citations[0]).toMatchObject({
      anchor: {
        blockId: "blk-1",
        segmentId: "seg-1",
        selectedText: "first second",
      },
      id: "cit-1",
      noteId: "note-split-citation",
      referenceId: "ref-1",
    })
    expect(restored.blocks[0]).toMatchObject({
      segments: [
        { citationId: "cit-1", id: "seg-1", text: "first ", type: "text" },
        { citationId: "cit-1", id: "seg-2", text: "second", type: "text" },
      ],
    })
  })

  it("flags TipTap-only structural warnings before normalization can hide them", () => {
    const sourceDraft = normalizeStructuredNoteDraft({
      blocks: [],
      citations: [],
      id: "note-warnings",
      references: [],
      title: "",
      writtenAt: "2026-05-15",
    })
    const tiptap: TipTapJsonNode = {
      content: [
        {
          attrs: { aphorismId: "aph-1", blockId: "duplicate-block" },
          content: [{ text: "first aphorism block", type: "text" }],
          type: "aphorism",
        },
        {
          attrs: { blockId: "middle-block" },
          content: [{ text: "middle paragraph", type: "text" }],
          type: "structuredParagraph",
        },
        {
          attrs: { aphorismId: "aph-1", blockId: "duplicate-block" },
          content: [{ text: "discontinuous aphorism block", type: "text" }],
          type: "aphorism",
        },
      ],
      type: "doc",
    }

    const restored = createStructuredDraftFromTipTapPrototypeDocument({
      sourceDraft,
      tiptap,
    })
    const warningCodes = restored.warnings.map((warning) => warning.code)

    expect(warningCodes).toContain("duplicate-block-id")
    expect(warningCodes).toContain("discontinuous-aphorism")
    expect(restored.persistence.safeForCurrentNoteModel).toBe(false)
    expect(restored.persistence.unsupportedFeatures).toEqual(warningCodes)
  })
})
