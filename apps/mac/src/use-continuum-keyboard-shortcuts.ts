import { useEffect } from "react"

const AI_CORRECTION_SHORTCUT_CODE = "Digit8"

type UseContinuumKeyboardShortcutsOptions = {
  aiPanelOpen: boolean
  citationPreviewOpen: boolean
  editorMenuOpen: boolean
  noteMenuOpen: boolean
  closeAiPanel: () => void
  closeCitationPreview: () => void
  closeEditorMenu: () => void
  closeNoteMenu: () => void
  toggleAiPanel: () => void
  toggleToolsPanel: () => void
}

export function useContinuumKeyboardShortcuts({
  aiPanelOpen,
  citationPreviewOpen,
  editorMenuOpen,
  noteMenuOpen,
  closeAiPanel,
  closeCitationPreview,
  closeEditorMenu,
  closeNoteMenu,
  toggleAiPanel,
  toggleToolsPanel,
}: UseContinuumKeyboardShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && noteMenuOpen) {
        closeNoteMenu()
        return
      }

      if (event.key === "Escape" && citationPreviewOpen) {
        closeCitationPreview()
        return
      }

      if (event.key === "Escape" && editorMenuOpen) {
        closeEditorMenu()
        return
      }

      if (event.key === "Escape" && aiPanelOpen) {
        closeAiPanel()
        return
      }

      if (
        event.metaKey &&
        event.shiftKey &&
        (event.key === "8" || event.code === AI_CORRECTION_SHORTCUT_CODE)
      ) {
        event.preventDefault()
        toggleAiPanel()
        return
      }

      if (!event.metaKey || event.shiftKey || (event.key !== "9" && event.code !== "Digit9")) {
        return
      }
      event.preventDefault()
      toggleToolsPanel()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [
    aiPanelOpen,
    citationPreviewOpen,
    editorMenuOpen,
    noteMenuOpen,
    closeAiPanel,
    closeCitationPreview,
    closeEditorMenu,
    closeNoteMenu,
    toggleAiPanel,
    toggleToolsPanel,
  ])
}
