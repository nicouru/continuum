import {
  findCorrectionSession,
  upsertCorrectionSession,
  type CorrectionSessionRecord,
} from "@continuum/correction"
import { useCallback, useEffect, useRef, useState } from "react"
import type { ContinuumAiPanelCorrectionState } from "./ContinuumAiPanel"
import {
  readAiCorrectionSessions,
  writeAiCorrectionSessions,
} from "./ai-correction-sessions"

type ReadyAiCorrectionState = Extract<
  ContinuumAiPanelCorrectionState,
  { status: "ready" }
>

function createAiCorrectionSessionRecord(
  correction: ReadyAiCorrectionState,
): CorrectionSessionRecord | null {
  if (!correction.session) {
    return null
  }

  return {
    ...correction.session,
    sourceText: correction.sourceText,
    currentText: correction.originalText,
    correctedText: correction.correctedText,
    warnings: correction.warnings,
    suggestions: correction.suggestions,
    usage: correction.usage,
    updatedAt: Date.now(),
  }
}

export function useAiCorrectionSessions() {
  const sessionsRef = useRef<CorrectionSessionRecord[]>([])
  const saveTimerRef = useRef<number | undefined>(undefined)
  const [sessionRevision, setSessionRevision] = useState(0)

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== undefined) {
        window.clearTimeout(saveTimerRef.current)
      }
      writeAiCorrectionSessions(sessionsRef.current).catch(() => {})
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    readAiCorrectionSessions()
      .then((sessions) => {
        if (cancelled) {
          return
        }
        sessionsRef.current = sessions
        setSessionRevision((value) => value + 1)
      })
      .catch(() => {
        if (!cancelled) {
          sessionsRef.current = []
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const findAiCorrectionSession = useCallback((key: string) => {
    return findCorrectionSession(sessionsRef.current, key)
  }, [])

  const persistAiCorrectionRecord = useCallback((session: CorrectionSessionRecord) => {
    const nextSessions = upsertCorrectionSession(sessionsRef.current, session)
    sessionsRef.current = nextSessions
    if (saveTimerRef.current !== undefined) {
      window.clearTimeout(saveTimerRef.current)
    }
    saveTimerRef.current = window.setTimeout(() => {
      void writeAiCorrectionSessions(sessionsRef.current)
      saveTimerRef.current = undefined
    }, 350)
  }, [])

  const persistAiCorrectionState = useCallback(
    (correction: ReadyAiCorrectionState) => {
      const session = createAiCorrectionSessionRecord(correction)

      if (session) {
        persistAiCorrectionRecord(session)
      }
    },
    [persistAiCorrectionRecord],
  )

  return {
    findAiCorrectionSession,
    persistAiCorrectionState,
    sessionRevision,
  }
}
