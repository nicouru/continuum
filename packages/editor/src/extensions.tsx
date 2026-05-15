import { Extension, Mark, mergeAttributes, Node, type Editor } from "@tiptap/core"
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react"
import katex from "katex"

import { makeId } from "./editor-identity"

type InlineMathViewProps = {
  node: {
    attrs: {
      mathId?: string
      tex?: string
    }
  }
}

export const StructuredParagraphNode = Node.create({
  name: "structuredParagraph",
  group: "block",
  content: "inline*",
  defining: true,

  addAttributes() {
    return {
      blockId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-block-id"),
      },
      literaryBreakBefore: {
        default: false,
        parseHTML: (element) =>
          element.getAttribute("data-literary-break-before") === "true",
      },
    }
  },

  parseHTML() {
    return [{ tag: "p[data-node-type='structured-paragraph']" }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "p",
      mergeAttributes(HTMLAttributes, {
        "data-block-id": HTMLAttributes.blockId,
        "data-literary-break-before": HTMLAttributes.literaryBreakBefore
          ? "true"
          : null,
        "data-node-type": "structured-paragraph",
      }),
      0,
    ]
  },
})

export const AphorismNode = Node.create({
  name: "aphorism",
  group: "block",
  content: "inline*",
  defining: true,

  addAttributes() {
    return {
      aphorismId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-aphorism-id"),
      },
      blockId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-block-id"),
      },
      literaryBreakBefore: {
        default: false,
        parseHTML: (element) =>
          element.getAttribute("data-literary-break-before") === "true",
      },
      markerCountsInSequence: {
        default: true,
        parseHTML: (element) =>
          element.getAttribute("data-marker-counts-in-sequence") !== "false",
      },
      markerValue: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-marker-value"),
      },
      visibleLabel: {
        default: "",
        parseHTML: (element) =>
          element.getAttribute("data-aphorism-label") ?? "",
      },
    }
  },

  parseHTML() {
    return [{ tag: "p[data-node-type='aphorism']" }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "p",
      mergeAttributes(HTMLAttributes, {
        "data-aphorism-id": HTMLAttributes.aphorismId,
        ...(HTMLAttributes.aphorismId && !HTMLAttributes.visibleLabel
          ? { "data-continuation": "true" }
          : {}),
        "data-aphorism-label": HTMLAttributes.visibleLabel,
        "data-block-id": HTMLAttributes.blockId,
        "data-literary-break-before": HTMLAttributes.literaryBreakBefore
          ? "true"
          : null,
        "data-marker-counts-in-sequence": String(
          HTMLAttributes.markerCountsInSequence !== false,
        ),
        "data-marker-value": HTMLAttributes.markerValue,
        "data-node-type": "aphorism",
      }),
      0,
    ]
  },

  addKeyboardShortcuts() {
    return {
      Backspace: () => unmarkAphorismAtStart(this.editor),
    }
  },
})

export const ReferenceInsertNode = Node.create({
  name: "referenceInsert",
  group: "block",
  content: "inline*",
  defining: true,

  addAttributes() {
    return {
      blockId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-block-id"),
      },
      referenceId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-reference-id"),
      },
      referenceInsertId: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-reference-insert-id"),
      },
      referenceLabel: {
        default: "",
        parseHTML: (element) =>
          element.getAttribute("data-reference-label") ?? "",
      },
      sourceFragmentFingerprint: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-source-fragment-fingerprint"),
      },
      sourceVersionId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-source-version-id"),
      },
    }
  },

  parseHTML() {
    return [{ tag: "blockquote[data-node-type='reference-insert']" }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "blockquote",
      mergeAttributes(HTMLAttributes, {
        "data-block-id": HTMLAttributes.blockId,
        "data-node-type": "reference-insert",
        "data-reference-id": HTMLAttributes.referenceId,
        "data-reference-insert-id": HTMLAttributes.referenceInsertId,
        "data-reference-label": HTMLAttributes.referenceLabel,
        "data-reference-state": HTMLAttributes.referenceId
          ? "resolved"
          : "unresolved",
        "data-source-fragment-fingerprint":
          HTMLAttributes.sourceFragmentFingerprint,
        "data-source-version-id": HTMLAttributes.sourceVersionId,
      }),
      0,
    ]
  },
})

export const InlineMathNode = Node.create({
  name: "inlineMath",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      mathId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-inline-math-id"),
      },
      tex: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-tex") ?? "",
      },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-node-type='inline-math']" }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-inline-math-id": HTMLAttributes.mathId,
        "data-node-type": "inline-math",
        "data-tex": HTMLAttributes.tex,
      }),
      HTMLAttributes.tex,
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(InlineMathView)
  },

  addKeyboardShortcuts() {
    return {
      Backspace: () => deleteInlineMathAroundSelection(this.editor, "before"),
      Delete: () => deleteInlineMathAroundSelection(this.editor, "after"),
    }
  },
})

export const ManualIndentNode = Node.create({
  name: "manualIndent",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      indentId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-manual-indent-id"),
      },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-node-type='manual-indent']" }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "aria-hidden": "true",
        "data-manual-indent-id": HTMLAttributes.indentId,
        "data-node-type": "manual-indent",
      }),
    ]
  },
})

export const SegmentMark = Mark.create({
  name: "segment",
  inclusive: true,

  addAttributes() {
    return {
      segmentId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-segment-id"),
      },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-segment-id]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-segment-id": HTMLAttributes.segmentId,
      }),
      0,
    ]
  },
})

export const CitationMark = Mark.create({
  name: "citation",
  inclusive: false,

  addAttributes() {
    return {
      citationId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-citation-id"),
      },
      anchorOffset: {
        default: null,
        parseHTML: (element) => {
          const value = element.getAttribute("data-anchor-offset")
          const offset = value === null ? NaN : Number.parseInt(value, 10)

          return Number.isInteger(offset) ? offset : null
        },
      },
      referenceId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-reference-id"),
      },
      visibleNumber: {
        default: "",
        parseHTML: (element) =>
          element.getAttribute("data-citation-number") ?? "",
      },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-citation-id]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-citation-id": HTMLAttributes.citationId,
        "data-citation-number": HTMLAttributes.visibleNumber,
        "data-anchor-offset": HTMLAttributes.anchorOffset,
        "data-reference-id": HTMLAttributes.referenceId,
        "data-reference-state": HTMLAttributes.referenceId
          ? "resolved"
          : "unresolved",
      }),
      0,
    ]
  },
})

export const ManualIndentExtension = Extension.create({
  name: "manualIndentKeyboard",

  addKeyboardShortcuts() {
    return {
      Tab: () => insertManualIndent(this.editor),
    }
  },
})

export const adminTipTapExtensions = [
  StructuredParagraphNode,
  AphorismNode,
  ReferenceInsertNode,
  InlineMathNode,
  ManualIndentNode,
  SegmentMark,
  CitationMark,
  ManualIndentExtension,
]

function InlineMathView({ node }: InlineMathViewProps) {
  const tex = node.attrs.tex ?? ""

  return (
    <NodeViewWrapper
      as="span"
      className="tiptap-inline-math"
      contentEditable={false}
      data-inline-math-id={node.attrs.mathId}
      data-node-type="inline-math"
    >
      <span
        dangerouslySetInnerHTML={{ __html: renderInlineMath(tex) }}
      />
    </NodeViewWrapper>
  )
}

function renderInlineMath(tex: string) {
  try {
    return katex.renderToString(tex, {
      displayMode: false,
      output: "html",
      throwOnError: false,
    })
  } catch {
    return tex
  }
}

function deleteInlineMathAroundSelection(
  editor: Editor,
  direction: "after" | "before",
) {
  const { selection } = editor.state

  if (!selection.empty) {
    return false
  }

  const cursor = selection.$from
  const node =
    direction === "before" ? cursor.nodeBefore : cursor.nodeAfter

  if (node?.type.name !== "inlineMath") {
    return false
  }

  const from = direction === "before" ? cursor.pos - node.nodeSize : cursor.pos
  const to = direction === "before" ? cursor.pos : cursor.pos + node.nodeSize

  editor.view.dispatch(editor.state.tr.delete(from, to))

  return true
}

function unmarkAphorismAtStart(editor: Editor) {
  const { schema, selection } = editor.state

  if (!selection.empty) {
    return false
  }

  const cursor = selection.$from
  const parent = cursor.parent

  if (parent.type.name !== "aphorism" || cursor.parentOffset !== 0) {
    return false
  }

  const paragraphType = schema.nodes.structuredParagraph

  if (!paragraphType) {
    return false
  }

  const blockId =
    typeof parent.attrs.blockId === "string" && parent.attrs.blockId.trim()
      ? parent.attrs.blockId
      : null

  editor.view.dispatch(
    editor.state.tr.setNodeMarkup(cursor.before(), paragraphType, { blockId }),
  )

  return true
}

function insertManualIndent(editor: Editor) {
  if (!editor.isEditable) {
    return false
  }

  if (!editor.schema.nodes.manualIndent) {
    return false
  }

  return editor
    .chain()
    .focus()
    .insertContent({
      attrs: {
        indentId: makeId("tiptap-indent"),
      },
      type: "manualIndent",
    })
    .run()
}
