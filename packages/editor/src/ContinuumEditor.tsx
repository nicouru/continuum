import type { Editor } from "@tiptap/core"
import Placeholder from "@tiptap/extension-placeholder"
import type { StructuredNoteDraft } from "@continuum/core"
import { EditorContent, useEditor } from "@tiptap/react"
import {
  useEffect,
  useRef,
  type FocusEventHandler,
  type MouseEventHandler,
} from "react"
import { createContinuumStarterKit } from "./editor-starter-kit"
import { adminTipTapExtensions } from "./extensions"
import { normalizeEditorIdentity } from "./editor-identity"
import { serializeTipTapClipboardNodesToPlainText } from "./tiptap-clipboard"
import {
  createStructuredDraftFromTipTapPrototypeDocument,
  createTipTapPrototypeDocumentFromStructuredDraft,
  type TipTapPrototypeDocument,
} from "./tiptap-document"
import type { TipTapJsonNode } from "./tiptap-types"
import { shouldBlockTipTapMediaTransfer } from "./media-guards"

export type ContinuumEditorPayload = {
  structuredDraft: StructuredNoteDraft
  tiptapJson: TipTapJsonNode
}

export type ContinuumEditorProps = {
  noteId: string
  initialDraft: StructuredNoteDraft
  initialPrototype: TipTapPrototypeDocument
  title: string
  writtenAt: string
  onTitleChange: (value: string) => void
  onWrittenAtChange: (value: string) => void
  onPayload: (payload: ContinuumEditorPayload) => void
  onCitationClick?: MouseEventHandler<HTMLDivElement>
  onEditorContextMenu?: MouseEventHandler<HTMLDivElement>
  onEditorFocus?: FocusEventHandler<HTMLDivElement>
  focusOnLoad?: boolean
  onFocusOnLoadConsumed?: () => void
  onReady?: (editor: Editor | null) => void
  showMetadataControls?: boolean
}

export function ContinuumEditor({
  noteId,
  initialDraft,
  initialPrototype,
  title,
  writtenAt,
  onTitleChange,
  onWrittenAtChange,
  onPayload,
  onCitationClick,
  onEditorContextMenu,
  onEditorFocus,
  focusOnLoad = false,
  onFocusOnLoadConsumed,
  onReady,
  showMetadataControls = true,
}: ContinuumEditorProps) {
  const sourceDraftRef = useRef(initialDraft)
  useEffect(() => {
    sourceDraftRef.current = initialDraft
  }, [initialDraft])

  const titleRef = useRef(title)
  const writtenAtRef = useRef(writtenAt)
  useEffect(() => {
    titleRef.current = title
  }, [title])
  useEffect(() => {
    writtenAtRef.current = writtenAt
  }, [writtenAt])

  const onPayloadRef = useRef(onPayload)
  useEffect(() => {
    onPayloadRef.current = onPayload
  }, [onPayload])

  const emitCurrentPayload = (instance: Editor) => {
    const nextJson = instance.getJSON() as TipTapJsonNode
    const mergedSource = {
      ...sourceDraftRef.current,
      title: titleRef.current,
      writtenAt: writtenAtRef.current,
    }
    const nextDraft = createStructuredDraftFromTipTapPrototypeDocument({
      sourceDraft: mergedSource,
      tiptap: nextJson,
    })
    onPayloadRef.current?.({
      structuredDraft: nextDraft,
      tiptapJson: nextJson,
    })
  }

  const editor = useEditor({
    content: initialPrototype.tiptap,
    editable: true,
    editorProps: {
      attributes: {
        "aria-label": "Continuum editor",
        lang: "es",
      },
      handleDOMEvents: {
        copy: (view, event) => {
          const slice = view.state.selection.content().content.toJSON()
          const plainText = serializeTipTapClipboardNodesToPlainText(slice)
          if (!plainText || !event.clipboardData) {
            return false
          }
          event.clipboardData.setData("text/plain", plainText)
          event.preventDefault()
          return true
        },
        drop: (_view, event) => {
          if (!shouldBlockTipTapMediaTransfer(event.dataTransfer)) {
            return false
          }
          event.preventDefault()
          return true
        },
        paste: (_view, event) => {
          if (!shouldBlockTipTapMediaTransfer(event.clipboardData)) {
            return false
          }
          event.preventDefault()
          return true
        },
      },
    },
    extensions: [
      createContinuumStarterKit(),
      ...adminTipTapExtensions,
      Placeholder.configure({ placeholder: "Escribí acá..." }),
    ],
    immediatelyRender: false,
    onUpdate: ({ editor: instance }) => {
      emitCurrentPayload(instance)
      queueMicrotask(() => normalizeEditorIdentity(instance))
    },
  })

  useEffect(() => {
    onReady?.(editor ?? null)
  }, [editor, onReady])

  const loadedNoteIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!editor) {
      return
    }
    if (loadedNoteIdRef.current === noteId) {
      return
    }
    loadedNoteIdRef.current = noteId
    editor.commands.setContent(initialPrototype.tiptap, { emitUpdate: false })
    if (focusOnLoad && isSingleEmptyTextBlockDocument(initialPrototype.tiptap)) {
      queueMicrotask(() => {
        if (!editor.isDestroyed) {
          editor.commands.focus(1)
          onFocusOnLoadConsumed?.()
        }
      })
    } else {
      editor.commands.blur()
    }
    queueMicrotask(() => normalizeEditorIdentity(editor))
    queueMicrotask(() => emitCurrentPayload(editor))
  }, [noteId, editor, initialPrototype, focusOnLoad, onFocusOnLoadConsumed])

  useEffect(() => {
    if (!editor) {
      return
    }
    emitCurrentPayload(editor)
  }, [editor, title, writtenAt])

  const handleSurfaceMouseDown: MouseEventHandler<HTMLDivElement> = (event) => {
    if (!editor || event.button !== 0) {
      return
    }

    const target = event.target as HTMLElement
    if (target.closest("input, button, a, select, textarea")) {
      return
    }

    if (target.closest(".tiptap")) {
      return
    }

    const coords = editor.view.posAtCoords({
      left: event.clientX,
      top: event.clientY,
    })

    if (coords) {
      editor.chain().focus().setTextSelection(coords.pos).run()
      return
    }

    editor.commands.focus("end")
  }

  const handleSurfaceClick: MouseEventHandler<HTMLDivElement> = (event) => {
    if (!editor || event.button !== 0) {
      return
    }

    const citationElement = (event.target as HTMLElement).closest<HTMLElement>(
      "span[data-citation-id]",
    )
    const citationId = citationElement?.dataset.citationId
    if (!citationId) {
      return
    }

    const range = findCitationMarkRange(editor, citationId)
    if (!range) {
      return
    }

    editor.chain().focus().setTextSelection(range).run()
    onCitationClick?.(event)
  }

  return (
    <div className="continuum-editor-root">
      {showMetadataControls ? (
        <div className="continuum-meta-row">
          <label className="continuum-meta-field">
            <span>Fecha escrita</span>
            <input
              type="date"
              value={(writtenAt || "").slice(0, 10)}
              onChange={(event) => onWrittenAtChange(event.target.value)}
            />
          </label>
          <label className="continuum-meta-field continuum-title-field">
            <span>Título (opcional)</span>
            <input
              type="text"
              value={title}
              placeholder="Sin título"
              onChange={(event) => onTitleChange(event.target.value)}
            />
          </label>
        </div>
      ) : null}
      <div
        className="continuum-editor-surface"
        onClick={handleSurfaceClick}
        onContextMenu={onEditorContextMenu}
        onFocusCapture={onEditorFocus}
        onMouseDown={handleSurfaceMouseDown}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

function findCitationMarkRange(editor: Editor, citationId: string) {
  const citationMark = editor.schema.marks.citation
  if (!citationMark) {
    return null
  }

  let range: { from: number; to: number } | null = null
  editor.state.doc.descendants((node, pos) => {
    if (range || !node.isText) {
      return !range
    }

    const hasCitation = node.marks.some(
      (mark) =>
        mark.type === citationMark && mark.attrs.citationId === citationId,
    )
    if (!hasCitation) {
      return true
    }

    range = {
      from: pos,
      to: pos + node.nodeSize,
    }
    return false
  })

  return range
}

export function continuumBootstrapPrototype(draft: StructuredNoteDraft): TipTapPrototypeDocument {
  return createTipTapPrototypeDocumentFromStructuredDraft(draft)
}

function isSingleEmptyTextBlockDocument(tiptap: TipTapJsonNode) {
  const content = tiptap.content ?? []

  if (content.length !== 1) {
    return false
  }

  const [node] = content

  return (
    Boolean(node) &&
    (node.type === "paragraph" || node.type === "structuredParagraph") &&
    !(node.content ?? []).some((child) => child.type !== "text" || child.text)
  )
}
