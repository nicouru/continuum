
import type { StructuredNoteDraft } from "@continuum/core"

export function formatReferenceLabel(
  reference: StructuredNoteDraft["references"][number],
) {
  const source = [reference.author, reference.work].filter(Boolean).join(", ")

  return source || reference.body || reference.id
}

export function filterReferences(
  references: StructuredNoteDraft["references"],
  query: string,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase()

  if (!normalizedQuery) {
    return references
  }

  return references.filter((reference) =>
    [
      reference.author,
      reference.body,
      reference.id,
      reference.work,
      formatReferenceLabel(reference),
    ]
      .filter(Boolean)
      .some((value) => value?.toLocaleLowerCase().includes(normalizedQuery)),
  )
}

export function getReferenceLabelById(
  draft: StructuredNoteDraft,
  referenceId: string,
) {
  const reference = draft.references.find((item) => item.id === referenceId)

  return reference ? formatReferenceLabel(reference) : ""
}
