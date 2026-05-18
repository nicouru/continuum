import type { Editor } from "@tiptap/core"
import {
  CorrectionError,
  refreshCorrectionSuggestionStatuses,
  shiftSuggestionOffsets,
  type CorrectionSuggestion,
} from "@continuum/correction"
import {
  applyCorrectionSuggestionToEditor,
  canSafelyApplyAllSuggestions,
  extractSelectionPlainTextMap,
  getSelectedText,
} from "@continuum/editor"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  createReadyAiCorrectionState,
  createReadyAiCorrectionStateFromResult,
  getAiCorrectionSelectionIdentity,
  isAiCorrectionSelectionError,
  refreshReadyAiCorrectionForIdentity,
  type AiCorrectionReadyState,
  type ContinuumAiPanelCorrectionState,
} from "../ai-correction-state"
import { createContinuumCorrectionProvider } from "../correction-client"
import { useAiCorrectionSessions } from "../use-ai-correction-sessions"
import { useAiSelectionHighlight } from "../use-ai-selection-highlight"

type EditorRef = {
  current: Editor | null
}

type UseAiCorrectionPanelOptions = {
  editorRef: EditorRef
  editorRevision: number
  onAiPanelOpen?: () => void
  openAiApiKey: string
  selectedId: string | null
}

function correctionErrorMessage(error: unknown): string {
  if (error instanceof CorrectionError) {
    return error.message
  }
  if (error instanceof Error) {
    return error.message
  }
  return "No se pudo corregir el texto seleccionado."
}

export function useAiCorrectionPanel({
  editorRef,
  editorRevision,
  onAiPanelOpen,
  openAiApiKey,
  selectedId,
}: UseAiCorrectionPanelOptions) {
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const [aiCorrection, setAiCorrection] = useState<ContinuumAiPanelCorrectionState>({
    status: "idle",
  })

  const correctionAbortRef = useRef<AbortController | null>(null)
  const selectedRef = useRef<string | null>(null)
  selectedRef.current = selectedId

  const {
    capturePendingAiSelectionHighlight,
    clearPendingAiSelectionHighlight,
    dispatchAiSelectionHighlight,
  } = useAiSelectionHighlight({
    editorRef,
    isOpen: aiPanelOpen,
    selectedId,
  })

  const {
    findAiCorrectionSession,
    persistAiCorrectionState,
    sessionRevision: aiCorrectionSessionRevision,
  } = useAiCorrectionSessions()

  const correctionProvider = useMemo(
    () => createContinuumCorrectionProvider(openAiApiKey),
    [openAiApiKey],
  )

  useEffect(() => {
    return () => {
      correctionAbortRef.current?.abort()
    }
  }, [])

  const aiSelectionSummary = useMemo(() => {
    void editorRevision
    const text = getSelectedText(editorRef.current).trim()

    if (!text) {
      return ""
    }

    return text.length > 180 ? `${text.slice(0, 180)}…` : text
  }, [editorRef, editorRevision])

  const syncAiCorrectionWithSelection = useCallback(() => {
    if (!aiPanelOpen) {
      return
    }

    const identity = getAiCorrectionSelectionIdentity(
      editorRef.current,
      selectedRef.current,
    )

    setAiCorrection((current) => {
      if (current.status === "loading") {
        return current
      }

      if (isAiCorrectionSelectionError(identity)) {
        if (current.status === "idle") {
          return current
        }
        return { status: "idle" }
      }

      if (current.status === "ready") {
        const refreshed = refreshReadyAiCorrectionForIdentity(current, identity)

        if (refreshed) {
          persistAiCorrectionState(refreshed)
          return refreshed
        }
      }

      const cached = findAiCorrectionSession(identity.key)

      if (!cached) {
        return current.status === "idle" ? current : { status: "idle" }
      }

      const next = createReadyAiCorrectionState(identity, cached)
      persistAiCorrectionState(next)
      return next
    })
  }, [aiPanelOpen, editorRef, findAiCorrectionSession, persistAiCorrectionState])

  useEffect(() => {
    correctionAbortRef.current?.abort()
    correctionAbortRef.current = null
    setAiCorrection({ status: "idle" })
  }, [selectedId])

  useEffect(() => {
    syncAiCorrectionWithSelection()
  }, [
    aiPanelOpen,
    editorRevision,
    aiCorrectionSessionRevision,
    selectedId,
    syncAiCorrectionWithSelection,
  ])

  const closeAiPanel = useCallback(() => {
    correctionAbortRef.current?.abort()
    correctionAbortRef.current = null
    clearPendingAiSelectionHighlight()
    setAiPanelOpen(false)
    setAiCorrection({ status: "idle" })
  }, [clearPendingAiSelectionHighlight])

  const dismissAiPanel = useCallback(() => {
    correctionAbortRef.current?.abort()
    correctionAbortRef.current = null
    setAiPanelOpen(false)
    setAiCorrection({ status: "idle" })
  }, [])

  const openAiPanel = useCallback(() => {
    capturePendingAiSelectionHighlight()
    setAiPanelOpen(true)
  }, [capturePendingAiSelectionHighlight])

  const toggleAiPanel = useCallback(() => {
    setAiPanelOpen((current) => {
      if (current) {
        correctionAbortRef.current?.abort()
        correctionAbortRef.current = null
        clearPendingAiSelectionHighlight()
        setAiCorrection({ status: "idle" })
        return false
      }
      capturePendingAiSelectionHighlight()
      onAiPanelOpen?.()
      return true
    })
  }, [
    capturePendingAiSelectionHighlight,
    clearPendingAiSelectionHighlight,
    onAiPanelOpen,
  ])

  const handleRunAiCorrection = useCallback(async () => {
    const identity = getAiCorrectionSelectionIdentity(
      editorRef.current,
      selectedRef.current,
    )

    if (isAiCorrectionSelectionError(identity)) {
      setAiCorrection({ status: "error", message: identity.reason })
      return
    }

    // Update the highlight to match the current correction range. This handles
    // the case where the user re-selected a different range while the panel was
    // already open before re-running the correction.
    dispatchAiSelectionHighlight({
      from: identity.map.selectionFrom,
      to: identity.map.selectionTo,
    })

    const cached = findAiCorrectionSession(identity.key)

    if (cached) {
      const next = createReadyAiCorrectionState(identity, cached)
      setAiCorrection(next)
      persistAiCorrectionState(next)
      return
    }

    correctionAbortRef.current?.abort()
    const controller = new AbortController()
    correctionAbortRef.current = controller
    setAiCorrection({ status: "loading" })

    try {
      const result = await correctionProvider.correct(
        {
          text: identity.map.plainText,
          locale: "es-UY",
          mode: "orthography_grammar",
        },
        { signal: controller.signal },
      )

      if (controller.signal.aborted) {
        return
      }

      const currentIdentity = getAiCorrectionSelectionIdentity(
        editorRef.current,
        selectedRef.current,
      )

      if (isAiCorrectionSelectionError(currentIdentity)) {
        setAiCorrection({ status: "idle" })
        return
      }

      if (
        currentIdentity.key !== identity.key ||
        currentIdentity.map.plainText !== identity.map.plainText
      ) {
        setAiCorrection({ status: "idle" })
        return
      }

      const next = createReadyAiCorrectionStateFromResult(
        identity,
        result,
        currentIdentity.map,
      )
      setAiCorrection(next)
      persistAiCorrectionState(next)
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        return
      }
      setAiCorrection({
        status: "error",
        message: correctionErrorMessage(error),
      })
    } finally {
      if (correctionAbortRef.current === controller) {
        correctionAbortRef.current = null
      }
    }
  }, [
    correctionProvider,
    dispatchAiSelectionHighlight,
    editorRef,
    findAiCorrectionSession,
    persistAiCorrectionState,
  ])

  const updateSuggestionInCorrectionState = useCallback(
    (
      suggestionId: string,
      updater: (suggestion: CorrectionSuggestion) => CorrectionSuggestion,
    ) => {
      setAiCorrection((current) => {
        if (current.status !== "ready") {
          return current
        }

        const next: AiCorrectionReadyState = {
          ...current,
          suggestions: current.suggestions.map((suggestion) =>
            suggestion.id === suggestionId ? updater(suggestion) : suggestion,
          ),
        }
        persistAiCorrectionState(next)
        return next
      })
    },
    [persistAiCorrectionState],
  )

  const handleApplyAiSuggestion = useCallback(
    (suggestionId: string) => {
      if (aiCorrection.status !== "ready") {
        return
      }

      const suggestion = aiCorrection.suggestions.find((item) => item.id === suggestionId)

      if (!suggestion || suggestion.status !== "pending") {
        return
      }

      const result = applyCorrectionSuggestionToEditor(
        editorRef.current,
        aiCorrection.map,
        suggestion,
      )

      if (result.status === "applied") {
        const lengthDelta = suggestion.replacement.length - suggestion.originalLength

        setAiCorrection((current) => {
          if (current.status !== "ready") {
            return current
          }

          const extraction = extractSelectionPlainTextMap(editorRef.current)
          const nextMap = extraction.ok ? extraction.map : current.map
          const updatedSuggestions = shiftSuggestionOffsets(
            current.suggestions.map((item) =>
              item.id === suggestionId ? { ...item, status: "applied" } : item,
            ),
            suggestion.originalOffset,
            suggestion.originalLength,
            lengthDelta,
          )

          const next: AiCorrectionReadyState = {
            ...current,
            originalText: extraction.ok ? nextMap.plainText : current.originalText,
            map: nextMap,
            suggestions: extraction.ok
              ? refreshCorrectionSuggestionStatuses(updatedSuggestions, nextMap.plainText)
              : updatedSuggestions.map((item) =>
                  item.status === "pending"
                    ? { ...item, status: "stale" as const }
                    : item,
                ),
          }
          persistAiCorrectionState(next)
          return next
        })
        return
      }

      updateSuggestionInCorrectionState(suggestionId, (currentSuggestion) => ({
        ...currentSuggestion,
        status: result.status === "unsafe" ? "unsafe" : "stale",
      }))
    },
    [aiCorrection, editorRef, persistAiCorrectionState, updateSuggestionInCorrectionState],
  )

  const handleApplyAllAiSuggestions = useCallback(() => {
    if (aiCorrection.status !== "ready") {
      return
    }

    if (!canSafelyApplyAllSuggestions(aiCorrection.map, aiCorrection.suggestions)) {
      return
    }

    let workingMap = aiCorrection.map
    let workingSuggestions = aiCorrection.suggestions

    const pending = workingSuggestions
      .filter((item) => item.status === "pending")
      .sort((left, right) => right.originalOffset - left.originalOffset)

    for (const suggestion of pending) {
      const result = applyCorrectionSuggestionToEditor(
        editorRef.current,
        workingMap,
        suggestion,
      )

      if (result.status !== "applied") {
        workingSuggestions = workingSuggestions.map((item) =>
          item.id === suggestion.id
            ? {
                ...item,
                status: result.status === "unsafe" ? ("unsafe" as const) : ("stale" as const),
              }
            : item,
        )
        continue
      }

      const lengthDelta = suggestion.replacement.length - suggestion.originalLength
      workingSuggestions = shiftSuggestionOffsets(
        workingSuggestions.map((item) =>
          item.id === suggestion.id ? { ...item, status: "applied" } : item,
        ),
        suggestion.originalOffset,
        suggestion.originalLength,
        lengthDelta,
      )

      const extraction = extractSelectionPlainTextMap(editorRef.current)
      if (extraction.ok) {
        workingMap = extraction.map
      }
    }

    setAiCorrection((current) => {
      if (current.status !== "ready") {
        return current
      }

      const next: AiCorrectionReadyState = {
        ...current,
        originalText: workingMap.plainText,
        map: workingMap,
        suggestions: refreshCorrectionSuggestionStatuses(
          workingSuggestions,
          workingMap.plainText,
        ),
      }
      persistAiCorrectionState(next)
      return next
    })
  }, [aiCorrection, editorRef, persistAiCorrectionState])

  const canApplyAll =
    aiCorrection.status === "ready" &&
    canSafelyApplyAllSuggestions(aiCorrection.map, aiCorrection.suggestions)

  return {
    aiCorrection,
    aiPanelOpen,
    aiSelectionSummary,
    canApplyAll,
    closeAiPanel,
    dismissAiPanel,
    handleApplyAllAiSuggestions,
    handleApplyAiSuggestion,
    handleRunAiCorrection,
    openAiPanel,
    toggleAiPanel,
  }
}
