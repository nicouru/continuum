import { useCallback, useState } from "react"
import type { ContinuumPreferences } from "./preferences"
import { writePreferences } from "./preferences"

const SIDEBAR_MIN_WIDTH = 250
const SIDEBAR_MAX_WIDTH = 460
export const SIDEBAR_DEFAULT_WIDTH = 320

export type AppearanceMode = "dark" | "light"

export function clampSidebarWidth(value: number) {
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(value, SIDEBAR_MAX_WIDTH))
}

export function useContinuumPreferencesState() {
  const [appearanceMode, setAppearanceMode] = useState<AppearanceMode>("dark")
  const [openAiApiKey, setOpenAiApiKey] = useState("")
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH)

  const applyPreferences = useCallback((preferences: ContinuumPreferences) => {
    setAppearanceMode(preferences.appearanceMode)
    setOpenAiApiKey(preferences.openAiApiKey ?? "")
    setSidebarVisible(preferences.sidebarVisible)
    setSidebarWidth(clampSidebarWidth(preferences.sidebarWidth))
  }, [])

  const handleSaveOpenAiApiKey = useCallback(async (apiKey: string) => {
    const nextApiKey = apiKey.trim()
    setOpenAiApiKey(nextApiKey)
    await writePreferences({ openAiApiKey: nextApiKey })
  }, [])

  const handleClearOpenAiApiKey = useCallback(async () => {
    setOpenAiApiKey("")
    await writePreferences({ openAiApiKey: null })
  }, [])

  const handleToggleSidebar = useCallback(() => {
    const next = !sidebarVisible
    setSidebarVisible(next)
    void writePreferences({ sidebarVisible: next })
  }, [sidebarVisible])

  const handleSetAppearanceMode = useCallback((value: AppearanceMode) => {
    setAppearanceMode(value)
    void writePreferences({ appearanceMode: value })
  }, [])

  const commitSidebarWidth = useCallback((value: number) => {
    const nextWidth = clampSidebarWidth(value)
    setSidebarWidth(nextWidth)
    void writePreferences({ sidebarWidth: nextWidth })
    return nextWidth
  }, [])

  const saveLastOpenedNoteId = useCallback((noteId: string | null) => {
    void writePreferences({ lastOpenedNoteId: noteId })
  }, [])

  return {
    appearanceMode,
    applyPreferences,
    commitSidebarWidth,
    handleClearOpenAiApiKey,
    handleSaveOpenAiApiKey,
    handleSetAppearanceMode,
    handleToggleSidebar,
    openAiApiKey,
    saveLastOpenedNoteId,
    setSidebarWidth,
    sidebarVisible,
    sidebarWidth,
  }
}
