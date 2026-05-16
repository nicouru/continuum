import type { StructuredNoteDraft } from "@continuum/core"
import { normalizeStructuredNoteDraft } from "@continuum/core"

function nextId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

export function cloneStructuredDraftForLocalDuplicate(
  source: StructuredNoteDraft,
): StructuredNoteDraft {
  const noteId = nextId("note")
  const blockIds = new Map<string, string>()
  const segmentIds = new Map<string, string>()
  const aphorismIds = new Map<string, string>()

  for (const block of source.blocks) {
    blockIds.set(block.id, nextId("block"))
    if (block.type === "paragraph") {
      for (const segment of block.segments) {
        segmentIds.set(segment.id, nextId("segment"))
      }
    }
  }

  for (const aphorism of source.aphorisms) {
    aphorismIds.set(aphorism.id, nextId("aphorism"))
  }

  const blocks = source.blocks.map((block) => {
    const id = blockIds.get(block.id) ?? nextId("block")
    if (block.type === "referenceInsert") {
      return {
        ...block,
        id,
        referenceInsertId: nextId("reference-insert"),
      }
    }
    return {
      ...block,
      aphorismId: block.aphorismId ? aphorismIds.get(block.aphorismId) : undefined,
      id,
      segments: block.segments.map((segment) => ({
        ...segment,
        id: segmentIds.get(segment.id) ?? nextId("segment"),
      })),
    }
  })

  return normalizeStructuredNoteDraft({
    ...source,
    aphorisms: source.aphorisms.map((aphorism) => ({
      ...aphorism,
      blockIds: aphorism.blockIds.map((id) => blockIds.get(id) ?? id),
      id: aphorismIds.get(aphorism.id) ?? nextId("aphorism"),
      noteId,
    })),
    blocks,
    citations: source.citations.map((citation) => ({
      ...citation,
      anchor: {
        ...citation.anchor,
        aphorismId: citation.anchor.aphorismId
          ? aphorismIds.get(citation.anchor.aphorismId)
          : undefined,
        blockId: blockIds.get(citation.anchor.blockId) ?? citation.anchor.blockId,
        segmentId: segmentIds.get(citation.anchor.segmentId) ?? citation.anchor.segmentId,
      },
      id: nextId("citation"),
      noteId,
    })),
    id: noteId,
    title: source.title.trim() ? `${source.title} (copia local)` : "Copia local",
    updatedAt: new Date().toISOString(),
  })
}
