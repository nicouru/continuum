
import type { Editor } from "@tiptap/core"

import { makeId, normalizeEditorIdentity } from "./editor-identity"

type TipTapTextMarks = Exclude<
  Parameters<Editor["schema"]["text"]>[1],
  null | undefined
>

export function convertMarkdownInlineMath(editor: Editor | null) {
  if (!editor) {
    return
  }

  let transaction = editor.state.tr
  let changed = false
  const textNodes: Array<{
    marks: TipTapTextMarks
    position: number
    text: string
  }> = []

  editor.state.doc.descendants((node, position) => {
    if (!node.isText || !node.text || !node.text.includes("$")) {
      return
    }

    textNodes.push({
      marks: node.marks,
      position,
      text: node.text,
    })
  })

  for (const node of textNodes.reverse()) {
    const parts = splitMarkdownInlineMath(node.text)

    if (!parts.some((part) => part.type === "math")) {
      continue
    }

    const content = parts
      .filter((part) => part.text)
      .map((part) =>
        part.type === "math"
          ? editor.schema.nodes.inlineMath.create({
              mathId: makeId("tiptap-math"),
              tex: part.text,
            })
          : editor.schema.text(
              part.text,
              createSplitTextSegmentMarks(editor, node.marks),
            ),
      )

    transaction = transaction.replaceWith(
      node.position,
      node.position + node.text.length,
      content,
    )
    changed = true
  }

  if (!changed) {
    return
  }

  editor.view.dispatch(transaction)
  normalizeEditorIdentity(editor)
}

function splitMarkdownInlineMath(text: string) {
  const parts: Array<{ text: string; type: "math" | "text" }> = []
  const pattern = /\$([^$\n]+)\$/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) {
      parts.push({
        text: text.slice(lastIndex, match.index),
        type: "text",
      })
    }

    parts.push({
      text: match[1].trim(),
      type: "math",
    })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push({
      text: text.slice(lastIndex),
      type: "text",
    })
  }

  return parts
}

function createSplitTextSegmentMarks(
  editor: Editor,
  marks: TipTapTextMarks,
) {
  const segmentType = editor.schema.marks.segment
  const nonSegmentMarks = marks.filter((mark) => mark.type.name !== "segment")

  if (!segmentType) {
    return nonSegmentMarks
  }

  return [
    segmentType.create({
      segmentId: makeId("tiptap-segment"),
    }),
    ...nonSegmentMarks,
  ]
}
