import { describe, expect, it } from "vitest"
import {
  excerptFromPlainText,
  extractStructuredDraftPlainText,
  extractStructuredDraftVisiblePlainText,
  normalizeStructuredNoteDraft,
} from "./index"

describe("StructuredNoteDraft index text", () => {
  it("does not use the reference library as empty-note text", () => {
    const draft = normalizeStructuredNoteDraft({
      blocks: [
        {
          id: "block-1",
          segments: [{ id: "segment-1", text: "", type: "text" }],
          type: "paragraph",
        },
      ],
      citations: [],
      id: "note-1",
      references: [
        {
          author: "Johann Wolfgang von Goethe",
          body: "All satisfaction in life is based on regular return.",
          id: "ref-1",
          work: "Poesia y verdad",
        },
      ],
      title: "",
      writtenAt: "2026-05-16",
    })

    expect(extractStructuredDraftVisiblePlainText(draft)).toBe("")
    expect(extractStructuredDraftPlainText(draft)).toBe("")
    expect(excerptFromPlainText(extractStructuredDraftPlainText(draft))).toBe("")
  })

  it("uses title and visible body text for note excerpts", () => {
    const draft = normalizeStructuredNoteDraft({
      blocks: [
        {
          id: "block-1",
          segments: [{ id: "segment-1", text: "Cuerpo de la nota", type: "text" }],
          type: "paragraph",
        },
      ],
      citations: [],
      id: "note-1",
      references: [
        {
          author: "Johann Wolfgang von Goethe",
          body: "Reference library text",
          id: "ref-1",
        },
      ],
      title: "Titulo",
      writtenAt: "2026-05-16",
    })

    expect(extractStructuredDraftPlainText(draft)).toBe("Titulo\nCuerpo de la nota")
  })
})
