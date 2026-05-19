import type { Editor } from "@tiptap/core"
import { aiSelectionHighlightPluginKey } from "@continuum/editor"
import { useCallback, useEffect, useRef } from "react"

type EditorRef = {
  current: Editor | null
}

type AiSelectionHighlightRange = {
  from: number
  to: number
}

type UseAiSelectionHighlightOptions = {
  editorRef: EditorRef
  isOpen: boolean
  selectedId: string | null
}

export function useAiSelectionHighlight({
  editorRef,
  isOpen,
  selectedId,
}: UseAiSelectionHighlightOptions) {
  const pendingHighlightRef = useRef<AiSelectionHighlightRange | null>(null)

  const dispatchAiSelectionHighlight = useCallback(
    (range: AiSelectionHighlightRange | null) => {
      const editor = editorRef.current
      if (!editor) return
      editor.view.dispatch(
        editor.state.tr.setMeta(aiSelectionHighlightPluginKey, range),
      )
    },
    [editorRef],
  )

  const clearPendingAiSelectionHighlight = useCallback(() => {
    pendingHighlightRef.current = null
  }, [])

  const capturePendingAiSelectionHighlight = useCallback(() => {
    const editor = editorRef.current
    pendingHighlightRef.current =
      editor && !editor.state.selection.empty
        ? {
            from: editor.state.selection.from,
            to: editor.state.selection.to,
          }
        : null
  }, [editorRef])

  useEffect(() => {
    pendingHighlightRef.current = null
    dispatchAiSelectionHighlight(null)
  }, [selectedId, dispatchAiSelectionHighlight])

  useEffect(() => {
    if (!isOpen) {
      pendingHighlightRef.current = null
      dispatchAiSelectionHighlight(null)
      return
    }

    const pendingHighlight = pendingHighlightRef.current
    if (pendingHighlight && pendingHighlight.from < pendingHighlight.to) {
      pendingHighlightRef.current = null
      dispatchAiSelectionHighlight(pendingHighlight)
      return
    }

    const editor = editorRef.current
    if (!editor) return
    const { from, to } = editor.state.selection
    if (from < to) {
      dispatchAiSelectionHighlight({ from, to })
    }
  }, [isOpen, dispatchAiSelectionHighlight, editorRef])

  return {
    capturePendingAiSelectionHighlight,
    clearPendingAiSelectionHighlight,
    dispatchAiSelectionHighlight,
  }
}
