
import type { Editor } from "@tiptap/core"

import type { StructuredNoteDraft } from "@continuum/core"
import { getReferenceLabelById } from "./editor-references"

export function normalizeEditorIdentity(editor: Editor) {
  normalizeDuplicateBlockIds(editor)
  normalizeDuplicateSegmentIds(editor)
  syncDerivedLabels(editor)
}

export function syncReferenceInsertLabels(
  editor: Editor,
  draft: StructuredNoteDraft,
) {
  if (!editor.schema.nodes.referenceInsert) {
    return
  }

  let transaction = editor.state.tr
  let changed = false

  editor.state.doc.descendants((node, position) => {
    if (node.type.name !== "referenceInsert") {
      return
    }

    const referenceId = getStringAttribute(node.attrs, "referenceId")
    const referenceLabel = referenceId
      ? getReferenceLabelById(draft, referenceId)
      : ""

    if (node.attrs.referenceLabel === referenceLabel) {
      return
    }

    transaction = transaction.setNodeMarkup(position, undefined, {
      ...node.attrs,
      referenceLabel,
    })
    changed = true
  })

  if (!changed) {
    return
  }

  transaction.setMeta("addToHistory", false)
  editor.view.dispatch(transaction)
}

export function getStringAttribute(
  attrs: Record<string, unknown>,
  key: string,
) {
  const value = attrs[key]

  return typeof value === "string" && value.trim() ? value : undefined
}

export function makeId(prefix: string) {
  const crypto = globalThis.crypto
  const random =
    typeof crypto?.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)

  return `${prefix}-${Date.now().toString(36)}-${random}`
}

export function makeDeterministicSplitId({
  baseId,
  position,
  usedIds,
}: {
  baseId: string
  position: number
  usedIds: Set<string>
}) {
  const normalizedBaseId = baseId.trim()
  const base = normalizedBaseId || `tiptap-segment-${position}`
  let nextId = `${base}-split-${position + 1}`
  let suffix = 2

  while (usedIds.has(nextId)) {
    nextId = `${base}-split-${position + 1}-${suffix}`
    suffix += 1
  }

  return nextId
}

function syncDerivedLabels(editor: Editor) {
  const aphorismType = editor.schema.nodes.aphorism
  const citationType = editor.schema.marks.citation

  if (!aphorismType && !citationType) {
    return
  }

  let transaction = editor.state.tr
  let changed = false

  if (aphorismType) {
    const seenAphorismIds = new Set<string>()
    let nextAphorismNumber = 1

    editor.state.doc.descendants((node, position) => {
      if (node.type.name !== "aphorism") {
        return
      }

      const aphorismId = getStringAttribute(node.attrs, "aphorismId")
      const isContinuation = aphorismId
        ? seenAphorismIds.has(aphorismId)
        : false
      const markerValue = getStringAttribute(node.attrs, "markerValue")
      const countsInSequence = node.attrs.markerCountsInSequence !== false
      const visibleLabel = isContinuation
        ? ""
        : markerValue ?? String(nextAphorismNumber)

      if (node.attrs.visibleLabel !== visibleLabel) {
        transaction = transaction.setNodeMarkup(position, undefined, {
          ...node.attrs,
          visibleLabel,
        })
        changed = true
      }

      if (!isContinuation && (!markerValue || countsInSequence)) {
        nextAphorismNumber += 1
      }

      if (aphorismId) {
        seenAphorismIds.add(aphorismId)
      }
    })
  }

  if (citationType) {
    const visibleNumbersByKey = new Map<string, number>()
    let nextCitationNumber = 1

    editor.state.doc.descendants((node) => {
      if (!node.isText) {
        return
      }

      for (const mark of node.marks) {
        if (mark.type.name !== "citation") {
          continue
        }

        const numberKey = getCitationNumberKey(mark.attrs)

        if (!numberKey || visibleNumbersByKey.has(numberKey)) {
          continue
        }

        visibleNumbersByKey.set(numberKey, nextCitationNumber)
        nextCitationNumber += 1
      }
    })

    editor.state.doc.descendants((node, position) => {
      if (!node.isText || !node.text) {
        return
      }

      for (const mark of node.marks) {
        if (mark.type.name !== "citation") {
          continue
        }

        const numberKey = getCitationNumberKey(mark.attrs)
        const visibleNumber = numberKey
          ? String(visibleNumbersByKey.get(numberKey) ?? "")
          : ""

        if (mark.attrs.visibleNumber === visibleNumber) {
          continue
        }

        const from = position
        const to = position + node.nodeSize

        transaction = transaction
          .removeMark(from, to, citationType)
          .addMark(
            from,
            to,
            citationType.create({
              ...mark.attrs,
              visibleNumber,
            }),
          )
        changed = true
      }
    })
  }

  if (!changed) {
    return
  }

  transaction.setMeta("addToHistory", false)
  editor.view.dispatch(transaction)
}

function getCitationNumberKey(attrs: Record<string, unknown>) {
  const referenceId = getStringAttribute(attrs, "referenceId")
  const citationId = getStringAttribute(attrs, "citationId")

  return referenceId ? `reference:${referenceId}` : citationId
}

function normalizeDuplicateSegmentIds(editor: Editor) {
  const segmentType = editor.schema.marks.segment

  if (!segmentType) {
    return
  }

  const usedSegmentIds = new Set<string>()
  let transaction = editor.state.tr
  let changed = false

  editor.state.doc.descendants((node, position) => {
    if (!node.isText || !node.text) {
      return
    }

    const segmentMark = node.marks.find((mark) => mark.type.name === "segment")
    const segmentId = segmentMark
      ? getStringAttribute(segmentMark.attrs, "segmentId")
      : undefined

    if (!segmentMark || !segmentId) {
      return
    }

    if (!usedSegmentIds.has(segmentId)) {
      usedSegmentIds.add(segmentId)
      return
    }

    const nextSegmentId = makeDeterministicSplitId({
      baseId: segmentId,
      position,
      usedIds: usedSegmentIds,
    })
    const from = position
    const to = position + node.nodeSize

    transaction = transaction
      .removeMark(from, to, segmentType)
      .addMark(
        from,
        to,
        segmentType.create({
          segmentId: nextSegmentId,
        }),
      )
    usedSegmentIds.add(nextSegmentId)
    changed = true
  })

  if (!changed) {
    return
  }

  transaction.setMeta("addToHistory", false)
  editor.view.dispatch(transaction)
}

function normalizeDuplicateBlockIds(editor: Editor) {
  const usedBlockIds = new Set<string>()
  let transaction = editor.state.tr
  let changed = false

  editor.state.doc.descendants((node, position) => {
    if (!supportsBlockIdAttribute(node.type.name)) {
      return
    }

    const blockId = getStringAttribute(node.attrs, "blockId")
    const nextBlockId =
      blockId && !usedBlockIds.has(blockId)
        ? blockId
        : makeId(getBlockIdPrefix(node.type.name))

    usedBlockIds.add(nextBlockId)

    if (nextBlockId === blockId) {
      return false
    }

    const nextAttrs: Record<string, unknown> = {
      ...node.attrs,
      blockId: nextBlockId,
    }

    if (
      node.type.name === "referenceInsert" &&
      (!getStringAttribute(node.attrs, "referenceInsertId") ||
        getStringAttribute(node.attrs, "referenceInsertId") === blockId)
    ) {
      nextAttrs.referenceInsertId = nextBlockId
    }

    transaction = transaction.setNodeMarkup(position, undefined, nextAttrs)
    changed = true

    return false
  })

  if (!changed) {
    return
  }

  transaction.setMeta("addToHistory", false)
  editor.view.dispatch(transaction)
}

function supportsBlockIdAttribute(typeName: string) {
  return (
    typeName === "aphorism" ||
    typeName === "referenceInsert" ||
    typeName === "structuredParagraph"
  )
}

function getBlockIdPrefix(typeName: string) {
  return typeName === "referenceInsert"
    ? "tiptap-reference-insert"
    : "tiptap-block"
}
