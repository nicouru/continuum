import type { StructuredNoteDraft } from "./structured-note-draft/types"

/** Concatenated plain text for SQLite indexing / excerpt derivation (FTS prep). */
export function extractStructuredDraftPlainText(draft: StructuredNoteDraft): string {
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

  for (const reference of draft.references) {
    const blob = [
      reference.author,
      reference.work,
      reference.body,
      reference.edition,
      reference.translator,
    ]
      .filter(Boolean)
      .join(" ")
    if (blob.trim()) {
      parts.push(blob.trim())
    }
  }

  return parts.join("\n").trim()
}

export function excerptFromPlainText(plain: string, maxLength = 200): string {
  const collapsed = plain.replace(/\s+/g, " ").trim()
  if (collapsed.length <= maxLength) {
    return collapsed
  }

  return `${collapsed.slice(0, maxLength - 1)}…`
}
