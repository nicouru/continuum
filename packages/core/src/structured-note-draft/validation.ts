import type {
  StructuredNoteDraftBlock,
  StructuredNoteDraftCitation,
  StructuredNoteDraftReference,
  StructuredNoteDraftWarning,
} from "./types"

export function getStructuredNoteDraftWarnings({
  blocks,
  citations,
  references,
}: {
  blocks: readonly StructuredNoteDraftBlock[]
  citations: readonly StructuredNoteDraftCitation[]
  references: readonly StructuredNoteDraftReference[]
}) {
  const referenceIds = new Set(references.map((reference) => reference.id))
  const warnings: StructuredNoteDraftWarning[] = []

  for (const citation of citations) {
    if (!citation.referenceId) {
      warnings.push({
        code: "unresolved-citation",
        detail: "La cita todavia no tiene referencia asociada.",
        id: citation.id,
      })
      continue
    }

    if (!referenceIds.has(citation.referenceId)) {
      warnings.push({
        code: "unresolved-citation",
        detail: "La cita apunta a una referencia inexistente.",
        id: citation.id,
      })
    }
  }

  for (const block of blocks) {
    if (
      block.type === "referenceInsert" &&
      !referenceIds.has(block.referenceId)
    ) {
      warnings.push({
        code: "missing-reference-insert-reference",
        detail: "La cita insertada apunta a una referencia inexistente.",
        id: block.id,
      })
    }
  }

  return warnings
}

export function getUnsupportedCurrentNoteModelFeatures({
  blocks,
  citations,
  references,
}: {
  blocks: readonly StructuredNoteDraftBlock[]
  citations: readonly StructuredNoteDraftCitation[]
  references: readonly StructuredNoteDraftReference[]
}) {
  const unsupportedFeatures = new Set<string>()
  const referenceIds = new Set(references.map((reference) => reference.id))

  for (const citation of citations) {
    if (!citation.referenceId || !referenceIds.has(citation.referenceId)) {
      unsupportedFeatures.add("unresolvedCitation")
    }
  }

  for (const block of blocks) {
    if (
      block.type === "referenceInsert" &&
      (!block.referenceId || !referenceIds.has(block.referenceId))
    ) {
      unsupportedFeatures.add("missingReferenceInsertReference")
    }
  }

  return Array.from(unsupportedFeatures)
}
