
import type { Editor } from "@tiptap/core"

import type { StructuredNoteDraft } from "@continuum/core"
import {
  getStringAttribute,
  makeId,
  normalizeEditorIdentity,
  syncReferenceInsertLabels,
} from "./editor-identity"
import { getSelectedText, getNextCitationNumber } from "./editor-queries"
import { getReferenceLabelById } from "./editor-references"

const OPENING_QUOTE_MARKS = new Set(['"', "“", "”", "„", "«"])
const CLOSING_QUOTE_MARKS = new Set(['"', "“", "”", "‟", "»"])

export function addCitationToSelection(editor: Editor | null) {
  if (!editor || editor.state.selection.empty) {
    return null
  }

  const citationId = makeId("tiptap-citation")
  const segmentId = makeId("tiptap-segment")
  const visibleNumber = String(getNextCitationNumber(editor))

  editor
    .chain()
    .focus()
    .setMark("segment", { segmentId })
    .setMark("citation", {
      citationId,
      referenceId: null,
      visibleNumber,
    })
    .run()
  normalizeEditorIdentity(editor)

  return citationId
}

export function removeCitationFromSelection(editor: Editor | null) {
  if (!editor) {
    return
  }

  const command = editor.chain().focus()

  if (editor.state.selection.empty) {
    command.extendMarkRange("citation")
  }

  command.unsetMark("citation").run()
  normalizeEditorIdentity(editor)
}

export function associateReferenceWithActiveCitation(
  editor: Editor | null,
  referenceId: string,
) {
  if (!editor || !referenceId) {
    return
  }

  const attrs = editor.getAttributes("citation")
  const citationId = getStringAttribute(attrs, "citationId")

  if (!citationId) {
    return
  }

  const command = editor.chain().focus()

  if (editor.state.selection.empty) {
    command.extendMarkRange("citation")
  }

  command
    .setMark("citation", {
      ...attrs,
      citationId,
      referenceId,
    })
    .run()
  normalizeEditorIdentity(editor)
}

export function clearReferenceFromActiveCitation(editor: Editor | null) {
  if (!editor) {
    return
  }

  const attrs = editor.getAttributes("citation")
  const citationId = getStringAttribute(attrs, "citationId")

  if (!citationId) {
    return
  }

  const command = editor.chain().focus()

  if (editor.state.selection.empty) {
    command.extendMarkRange("citation")
  }

  command
    .setMark("citation", {
      ...attrs,
      citationId,
      referenceId: null,
    })
    .run()
  normalizeEditorIdentity(editor)
}

export function associateReferenceWithActiveReferenceInsert(
  editor: Editor | null,
  referenceId: string,
  draft: StructuredNoteDraft,
) {
  if (!editor || !referenceId || !editor.isActive("referenceInsert")) {
    return
  }

  const attrs = editor.getAttributes("referenceInsert")
  const blockId = getStringAttribute(attrs, "blockId")
  const referenceInsertId = getStringAttribute(attrs, "referenceInsertId")

  if (!blockId || !referenceInsertId) {
    return
  }

  editor
    .chain()
    .focus()
    .updateAttributes("referenceInsert", {
      ...attrs,
      blockId,
      referenceId,
      referenceInsertId,
      referenceLabel: getReferenceLabelById(draft, referenceId),
    })
    .run()
  normalizeEditorIdentity(editor)
}

export function clearReferenceFromActiveReferenceInsert(
  editor: Editor | null,
  draft: StructuredNoteDraft,
) {
  if (!editor || !editor.isActive("referenceInsert")) {
    return
  }

  const attrs = editor.getAttributes("referenceInsert")
  const blockId = getStringAttribute(attrs, "blockId")
  const referenceInsertId = getStringAttribute(attrs, "referenceInsertId")

  if (!blockId || !referenceInsertId) {
    return
  }

  editor
    .chain()
    .focus()
    .updateAttributes("referenceInsert", {
      ...attrs,
      blockId,
      referenceId: "",
      referenceInsertId,
      referenceLabel: "",
    })
    .run()
  syncReferenceInsertLabels(editor, draft)
}

export function convertSelectionToReferenceInsert(editor: Editor | null) {
  const selectedText = getSelectedText(editor)

  if (!editor || !selectedText.trim()) {
    return
  }

  const blockId = makeId("tiptap-reference-insert")
  const quotedText = quoteReferenceInsertText(selectedText)

  editor
    .chain()
    .focus()
    .deleteSelection()
    .insertContent({
      attrs: {
        blockId,
        referenceId: "",
        referenceInsertId: blockId,
      },
      content: [
        {
          marks: [
            {
              attrs: {
                segmentId: `${blockId}-segment-1`,
              },
              type: "segment",
            },
          ],
          text: quotedText,
          type: "text",
        },
      ],
      type: "referenceInsert",
    })
    .run()
  normalizeEditorIdentity(editor)

  return blockId
}

function quoteReferenceInsertText(text: string) {
  const leadingWhitespaceLength = text.match(/^\s*/)?.[0].length ?? 0
  const trailingWhitespaceLength = text.match(/\s*$/)?.[0].length ?? 0
  const leadingWhitespace = text.slice(0, leadingWhitespaceLength)
  const trailingWhitespace =
    trailingWhitespaceLength > 0 ? text.slice(text.length - trailingWhitespaceLength) : ""
  const coreEnd =
    trailingWhitespaceLength > 0 ? text.length - trailingWhitespaceLength : text.length
  let core = text.slice(leadingWhitespaceLength, coreEnd)

  if (
    core.length >= 2 &&
    OPENING_QUOTE_MARKS.has(core[0]) &&
    CLOSING_QUOTE_MARKS.has(core[core.length - 1])
  ) {
    core = core.slice(1, -1).trim()
  }

  return `${leadingWhitespace}“${core}”${trailingWhitespace}`
}
