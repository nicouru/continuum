import {
  findCorrectionSession,
  upsertCorrectionSession,
  type CorrectionSessionRecord,
} from "@continuum/correction"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  createAiCorrectionSessionRecord,
  type AiCorrectionReadyState,
} from "./ai-correction-state"
import {
  readAiCorrectionSessions,
  writeAiCorrectionSessions,
} from "./ai-correction-sessions"

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
    (correction: AiCorrectionReadyState) => {
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
