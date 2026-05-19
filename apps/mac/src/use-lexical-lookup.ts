import type { Editor } from "@tiptap/core"
import { getSelectedText } from "@continuum/editor"
import {
  LexicalLookupError,
  normalizeSingleSelectedWord,
  type LexicalLookupResult,
} from "@continuum/lexical"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createContinuumLexicalProvider } from "./lexical-client"

type EditorRef = {
  current: Editor | null
}

type UseLexicalLookupOptions = {
  editorRef: EditorRef
  editorRevision: number
  isMenuOpen: boolean
}

export type LexicalLookupState =
  | {
      status: "loading"
      term: string
    }
  | {
      result: LexicalLookupResult
      status: "ready"
      term: string
    }
  | {
      message: string
      status: "error"
      term: string
    }

function lexicalErrorMessage(error: unknown): string {
  if (error instanceof LexicalLookupError) {
    return error.message
  }
  if (error instanceof Error) {
    return error.message
  }
  return "No se pudo consultar la fuente lexical."
}

export function useLexicalLookup({
  editorRef,
  editorRevision,
  isMenuOpen,
}: UseLexicalLookupOptions) {
  const lexicalProvider = useMemo(() => createContinuumLexicalProvider(), [])
  const [lexicalLookup, setLexicalLookup] = useState<LexicalLookupState | null>(null)
  const lexicalAbortRef = useRef<AbortController | null>(null)
  const lexicalRequestIdRef = useRef(0)

  const clearLexicalLookup = useCallback(() => {
    lexicalAbortRef.current?.abort()
    lexicalAbortRef.current = null
    lexicalRequestIdRef.current += 1
    setLexicalLookup(null)
  }, [])

  const startLexicalLookupFromSelection = useCallback(() => {
    const term = normalizeSingleSelectedWord(getSelectedText(editorRef.current))

    lexicalAbortRef.current?.abort()
    lexicalRequestIdRef.current += 1

    if (!term) {
      lexicalAbortRef.current = null
      setLexicalLookup(null)
      return
    }

    const requestId = lexicalRequestIdRef.current
    const controller = new AbortController()
    lexicalAbortRef.current = controller
    setLexicalLookup({ status: "loading", term })

    lexicalProvider
      .lookup(term, { signal: controller.signal })
      .then((result) => {
        if (lexicalRequestIdRef.current !== requestId || controller.signal.aborted) {
          return
        }
        setLexicalLookup({ result, status: "ready", term })
      })
      .catch((error: unknown) => {
        if (lexicalRequestIdRef.current !== requestId || controller.signal.aborted) {
          return
        }
        setLexicalLookup({
          message: lexicalErrorMessage(error),
          status: "error",
          term,
        })
      })
  }, [editorRef, lexicalProvider])

  useEffect(() => {
    if (!isMenuOpen) {
      return
    }

    const term = normalizeSingleSelectedWord(getSelectedText(editorRef.current))

    if (!term) {
      if (lexicalLookup) {
        clearLexicalLookup()
      }
      return
    }

    if (lexicalLookup?.term !== term) {
      startLexicalLookupFromSelection()
    }
  }, [
    clearLexicalLookup,
    editorRef,
    editorRevision,
    isMenuOpen,
    lexicalLookup,
    startLexicalLookupFromSelection,
  ])

  useEffect(() => {
    return () => {
      lexicalAbortRef.current?.abort()
    }
  }, [])

  return {
    clearLexicalLookup,
    lexicalLookup,
    startLexicalLookupFromSelection,
  }
}
