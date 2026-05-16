import { describe, expect, it } from "vitest"
import {
  CONTINUUM_TRAILING_NODE_NOT_AFTER,
  createContinuumStarterKit,
} from "./editor-starter-kit"

describe("createContinuumStarterKit", () => {
  it("does not append trailing paragraphs after Continuum editable blocks", () => {
    const starterKit = createContinuumStarterKit()

    expect(starterKit.options.trailingNode).toEqual({
      notAfter: [...CONTINUUM_TRAILING_NODE_NOT_AFTER],
    })
    expect(CONTINUUM_TRAILING_NODE_NOT_AFTER).toEqual([
      "paragraph",
      "structuredParagraph",
      "aphorism",
    ])
  })
})
