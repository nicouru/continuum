import StarterKit from "@tiptap/starter-kit"

export const CONTINUUM_TRAILING_NODE_NOT_AFTER = [
  "paragraph",
  "structuredParagraph",
  "aphorism",
] as const

export function createContinuumStarterKit() {
  return StarterKit.configure({
    blockquote: false,
    code: false,
    trailingNode: {
      notAfter: [...CONTINUUM_TRAILING_NODE_NOT_AFTER],
    },
  })
}
