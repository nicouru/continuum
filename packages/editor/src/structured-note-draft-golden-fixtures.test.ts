import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  convertNoteToStructuredDraft,
  convertStructuredNoteDraftReferences,
  convertStructuredNoteDraftToNote,
  normalizeStructuredNoteDraft,
} from "@continuum/core"
import type { StructuredNoteDraft } from "@continuum/core"
import {
  createStructuredDraftFromTipTapPrototypeDocument,
  createTipTapPrototypeDocumentFromStructuredDraft,
} from "./tiptap-document"
import type { TipTapJsonNode } from "./tiptap-types"

type GoldenExpected = {
  aphorismIds: string[]
  blockIds: string[]
  canRoundTripThroughNote: boolean
  canRoundTripThroughTipTap: boolean
  citationIds: string[]
  referenceIds: string[]
  safeForCurrentNoteModel: boolean
  unsupportedFeatures: string[]
  warningCodes: string[]
}

type GoldenStructuredDraftCase = {
  draft: unknown
  expected: GoldenExpected
  name: string
}

type GoldenTipTapWarningCase = {
  expected: {
    aphorismIds?: string[]
    blockIds: string[]
    safeForCurrentNoteModel: boolean
    unsupportedFeatures: string[]
    warningCodes: string[]
  }
  name: string
  sourceDraft: unknown
  tiptap: TipTapJsonNode
}

const fixtureSet = JSON.parse(
  readFileSync(
    new URL("../../../contract-fixtures/structured-note-draft-golden.json", import.meta.url),
    "utf8",
  ),
) as {
  structuredDraftCases: GoldenStructuredDraftCase[]
  tipTapWarningCases: GoldenTipTapWarningCase[]
  version: 1
}

describe("shared StructuredNoteDraft golden fixtures", () => {
  it("uses the expected fixture contract version", () => {
    expect(fixtureSet.version).toBe(1)
  })

  for (const fixture of fixtureSet.structuredDraftCases) {
    it(`preserves ${fixture.name}`, () => {
      const draft = normalizeStructuredNoteDraft(fixture.draft)

      expectStructuredDraftSummary(draft, fixture.expected)

      if (fixture.expected.canRoundTripThroughTipTap) {
        const prototype = createTipTapPrototypeDocumentFromStructuredDraft(draft)
        const restored = createStructuredDraftFromTipTapPrototypeDocument({
          sourceDraft: draft,
          tiptap: prototype.tiptap,
        })

        expectStructuredDraftSummary(restored, fixture.expected)
        expectTipTapRoundTripBlocks(restored.blocks, draft.blocks)
        expect(restored.aphorisms).toEqual(draft.aphorisms)
        expect(restored.citations).toEqual(draft.citations)
        expect(restored.references).toEqual(draft.references)
      }

      if (fixture.expected.canRoundTripThroughNote) {
        const note = convertStructuredNoteDraftToNote(draft, {
          slug: fixture.name,
        })
        const roundTripDraft = normalizeStructuredNoteDraft(
          convertNoteToStructuredDraft({
            note,
            references: convertStructuredNoteDraftReferences(draft),
            updatedAt: draft.updatedAt,
          }),
        )

        expectStructuredDraftSummary(roundTripDraft, fixture.expected)
        expect(roundTripDraft.blocks).toEqual(draft.blocks)
        expect(roundTripDraft.aphorisms).toEqual(draft.aphorisms)
        expect(roundTripDraft.citations).toEqual(draft.citations)
        expectReferenceBodies(roundTripDraft, draft)
      }
    })
  }

  for (const fixture of fixtureSet.tipTapWarningCases) {
    it(`flags ${fixture.name}`, () => {
      const sourceDraft = normalizeStructuredNoteDraft(fixture.sourceDraft)
      const restored = createStructuredDraftFromTipTapPrototypeDocument({
        sourceDraft,
        tiptap: fixture.tiptap,
      })

      expect(restored.blocks.map((block) => block.id)).toEqual(
        fixture.expected.blockIds,
      )
      expect(restored.persistence.safeForCurrentNoteModel).toBe(
        fixture.expected.safeForCurrentNoteModel,
      )
      expect(restored.persistence.unsupportedFeatures).toEqual(
        fixture.expected.unsupportedFeatures,
      )
      expect(getWarningCodes(restored)).toEqual(fixture.expected.warningCodes)

      if (fixture.expected.aphorismIds) {
        expect(restored.aphorisms.map((aphorism) => aphorism.id)).toEqual(
          fixture.expected.aphorismIds,
        )
      }
    })
  }
})

function expectStructuredDraftSummary(
  draft: StructuredNoteDraft,
  expected: GoldenExpected,
) {
  expect(draft.source).toEqual({ kind: "structuredNoteDraft", version: 1 })
  expect(draft.blocks.map((block) => block.id)).toEqual(expected.blockIds)
  expect(draft.aphorisms.map((aphorism) => aphorism.id)).toEqual(
    expected.aphorismIds,
  )
  expect(draft.citations.map((citation) => citation.id)).toEqual(
    expected.citationIds,
  )
  expect(draft.references.map((reference) => reference.id)).toEqual(
    expected.referenceIds,
  )
  expect(draft.persistence.safeForCurrentNoteModel).toBe(
    expected.safeForCurrentNoteModel,
  )
  expect(draft.persistence.unsupportedFeatures).toEqual(
    expected.unsupportedFeatures,
  )
  expect(getWarningCodes(draft)).toEqual(expected.warningCodes)
}

function expectReferenceBodies(actual: StructuredNoteDraft, expected: StructuredNoteDraft) {
  expect(
    actual.references.map((reference) => ({
      body: reference.body,
      id: reference.id,
    })),
  ).toEqual(
    expected.references.map((reference) => ({
      body: reference.body,
      id: reference.id,
    })),
  )
}

function expectTipTapRoundTripBlocks(
  actual: StructuredNoteDraft["blocks"],
  expected: StructuredNoteDraft["blocks"],
) {
  expect(normalizeSoftBreakSegmentIds(actual)).toEqual(
    normalizeSoftBreakSegmentIds(expected),
  )
}

function normalizeSoftBreakSegmentIds(blocks: StructuredNoteDraft["blocks"]) {
  return blocks.map((block) => {
    if (block.type !== "paragraph") {
      return block
    }

    return {
      ...block,
      segments: block.segments.map((segment) =>
        segment.type === "text" && segment.text === "\n"
          ? { ...segment, id: "__soft_break_segment__" }
          : segment,
      ),
    }
  })
}

function getWarningCodes(draft: StructuredNoteDraft) {
  return draft.warnings.map((warning) => warning.code)
}
