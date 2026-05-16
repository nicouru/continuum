import type { StructuredNoteDraft } from "./structured-note-draft/types"

/**
 * Concatenated visible note text for UI excerpts.
 *
 * References are intentionally excluded here: new Continuum notes are seeded
 * with the online reference library, but an empty note should still display as
 * an empty draft in the sidebar.
 */
export function extractStructuredDraftVisiblePlainText(
  draft: StructuredNoteDraft,
): string {
  return collectVisibleTextParts(draft).join("\n").trim()
}

/**
 * Concatenated plain text for SQLite indexing / FTS prep.
 *
 * This intentionally matches visible note text. The full `references` array is
 * a library carried by the draft, not necessarily content used in the note.
 */
export function extractStructuredDraftPlainText(draft: StructuredNoteDraft): string {
  return extractStructuredDraftVisiblePlainText(draft)
}

function collectVisibleTextParts(draft: StructuredNoteDraft): string[] {
  const parts: string[] = []

  const title = draft.title.trim()
  if (title) {
    parts.push(title)
  }

  for (const block of draft.blocks) {
    if (block.type === "referenceInsert") {
      if (block.text.trim()) {
        parts.push(block.text)
      }
      continue
    }

    for (const segment of block.segments) {
      switch (segment.type) {
        case "text":
          if (segment.text) {
            parts.push(segment.text)
          }
          break
        case "inlineMath":
          if (segment.tex) {
            parts.push(segment.tex)
          }
          break
        default:
          break
      }
    }
  }

  return parts
}

export function excerptFromPlainText(plain: string, maxLength = 200): string {
  const collapsed = plain.replace(/\s+/g, " ").trim()
  if (collapsed.length <= maxLength) {
    return collapsed
  }

  return `${collapsed.slice(0, maxLength - 1)}…`
}
