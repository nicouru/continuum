import type { Editor } from "@tiptap/core"
import Placeholder from "@tiptap/extension-placeholder"
import type { StructuredNoteDraft } from "@continuum/core"
import { EditorContent, useEditor } from "@tiptap/react"
import { useEffect, useRef } from "react"
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
    if (isSingleEmptyTextBlockDocument(initialPrototype.tiptap)) {
      queueMicrotask(() => {
        if (!editor.isDestroyed) {
          editor.commands.focus(1)
        }
      })
    }
    queueMicrotask(() => normalizeEditorIdentity(editor))
    queueMicrotask(() => emitCurrentPayload(editor))
  }, [noteId, editor, initialPrototype])

  useEffect(() => {
    if (!editor) {
      return
    }
    emitCurrentPayload(editor)
  }, [editor, title, writtenAt])

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
      <EditorContent editor={editor} className="continuum-editor-surface" />
    </div>
  )
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
