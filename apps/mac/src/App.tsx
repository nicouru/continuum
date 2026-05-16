import type { Editor } from "@tiptap/core"
import type { StructuredNoteDraft } from "@continuum/core"
import {
  createNewStructuredNoteDraft,
  normalizeStructuredNoteDraft,
} from "@continuum/core"
import { emergencyIsNewer } from "@continuum/storage"
import {
  ContinuumEditor,
  addCitationToSelection,
  associateReferenceWithActiveCitation,
  associateReferenceWithActiveReferenceInsert,
  clearReferenceFromActiveCitation,
  clearReferenceFromActiveReferenceInsert,
  continuumBootstrapPrototype,
  createStructuredDraftFromTipTapPrototypeDocument,
  convertMarkdownInlineMath,
  convertSelectionToReferenceInsert,
  filterReferences,
  getActiveCitationDetails,
  getActiveReferenceInsertDetails,
  getFirstInlineMathInSelection,
  makeId,
  markAllParagraphsAsAphorisms,
  markCurrentBlockAsAphorism,
  removeCitationFromSelection,
  type ContinuumEditorPayload,
  type TipTapJsonNode,
} from "@continuum/editor"
import type {
  NoteFull,
  NoteMeta,
  SyncConflictRecord,
  SyncStatusSummary,
} from "@continuum/storage/types"
import { DraftSyncEngine } from "@continuum/sync"
import type { FormEvent } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  clearDiarioAuthSession,
  getConfiguredDiarioBaseUrl,
  loginToDiario,
  logoutFromDiario,
  readDiarioAuthSession,
  saveDiarioAuthSession,
  type DiarioAuthSession,
} from "./auth"
import { openContinuumRepository } from "./bootstrap-db"
import {
  clearEmergencyDraft,
  readEmergencyDraft,
  writeEmergencyDraft,
} from "./emergency-draft"
import type { AsyncSqlNoteRepository } from "./note-repository/async-sql-note-repository"
import { readPreferences, writePreferences } from "./preferences"
import { createContinuumSyncClient } from "./sync-client"
import {
  ContinuumEditorMenu,
  type ContinuumEditorMenuReferenceInput,
} from "./ContinuumEditorMenu"
import "./App.css"

function bootstrapErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === "string") {
    return error
  }
  try {
    const serialized = JSON.stringify(error)
    if (serialized && serialized !== "{}") {
      return serialized
    }
  } catch {
    // Fall back to String(error) below.
  }
  const fallback = String(error)
  return fallback === "[object Object]" ? "No se pudo abrir la base local." : fallback
}

function syncStateLabel(state: NoteMeta["syncState"]) {
  switch (state) {
    case "local_only":
      return "Local"
    case "dirty":
      return "Pendiente"
    case "syncing":
      return "Subiendo"
    case "synced":
      return "Sync"
    case "offline":
      return "Offline"
    case "conflict":
      return "Conflicto"
    case "error":
      return "Error"
  }
}

function normalizeConflictPayload(error: unknown) {
  if (isRecord(error) && isRecord(error.details)) {
    return error.details
  }
  return error
}

function getConflictRemoteVersion(conflict: SyncConflictRecord | undefined) {
  const payload = conflict?.remotePayload
  if (!isRecord(payload)) {
    return null
  }
  if (typeof payload.serverRemoteVersion === "number") {
    return payload.serverRemoteVersion
  }
  if (typeof payload.serverRemoteRevision === "number") {
    return payload.serverRemoteRevision
  }
  if (isRecord(payload.remoteDraft) && typeof payload.remoteDraft.remoteVersion === "number") {
    return payload.remoteDraft.remoteVersion
  }
  if (isRecord(payload.body) && isRecord(payload.body.error)) {
    const details = payload.body.error.details
    if (isRecord(details) && typeof details.serverRemoteRevision === "number") {
      return details.serverRemoteRevision
    }
  }
  return null
}

type ConflictRemoteDraft = {
  remoteVersion: number
  structuredDraft: StructuredNoteDraft
  tiptapJson?: unknown
}

function getConflictRemoteDraft(conflict: SyncConflictRecord | undefined): ConflictRemoteDraft | null {
  const payload = conflict?.remotePayload
  if (!isRecord(payload)) {
    return null
  }

  const fromDirectPayload = parseConflictRemoteDraftValue(
    payload.remoteDraft,
    getConflictRemoteVersion(conflict),
  )
  if (fromDirectPayload) {
    return fromDirectPayload
  }

  if (isRecord(payload.body) && isRecord(payload.body.error)) {
    const details = payload.body.error.details
    if (isRecord(details)) {
      return parseConflictRemoteDraftValue(
        details.remoteDraft,
        getConflictRemoteVersion(conflict),
      )
    }
  }

  return null
}

function parseConflictRemoteDraftValue(
  value: unknown,
  fallbackVersion: number | null,
): ConflictRemoteDraft | null {
  if (!isRecord(value)) {
    return null
  }
  const sourceDraft = isRecord(value.structuredDraft)
    ? value.structuredDraft
    : isRecord(value.draft)
      ? value.draft
      : null
  if (!sourceDraft) {
    return null
  }
  const remoteVersion =
    typeof value.remoteVersion === "number"
      ? value.remoteVersion
      : isRecord(value.sync) && typeof value.sync.remoteRevision === "number"
        ? value.sync.remoteRevision
        : isRecord(value.sync) && typeof value.sync.remoteVersion === "number"
          ? value.sync.remoteVersion
          : fallbackVersion
  if (typeof remoteVersion !== "number") {
    return null
  }
  return {
    remoteVersion,
    structuredDraft: normalizeStructuredNoteDraft(sourceDraft),
    tiptapJson: value.tiptapJson,
  }
}

function formatRetryTime(value: string | null) {
  if (!value) {
    return null
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

function clampContextMenuPosition(x: number, y: number) {
  const margin = 10
  const menuWidth = 430
  const menuHeight = Math.min(720, window.innerHeight - margin * 2)

  return {
    x: Math.max(margin, Math.min(x, window.innerWidth - menuWidth - margin)),
    y: Math.max(margin, Math.min(y, window.innerHeight - menuHeight - margin)),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function hasUnpushedLocalState(note: NoteFull) {
  return (
    note.syncState === "dirty" ||
    note.syncState === "offline" ||
    note.syncState === "error" ||
    note.syncState === "conflict" ||
    note.syncState === "syncing"
  )
}

export default function App() {
  const [repo, setRepo] = useState<AsyncSqlNoteRepository | null>(null)
  const [deviceId, setDeviceId] = useState("")
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)
  const [authSession, setAuthSession] = useState<DiarioAuthSession | null>(null)
  const [authLoaded, setAuthLoaded] = useState(false)
  const [loginBaseUrl, setLoginBaseUrl] = useState(getConfiguredDiarioBaseUrl())
  const [loginEmail, setLoginEmail] = useState("")
  const [loginPassword, setLoginPassword] = useState("")
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loginSubmitting, setLoginSubmitting] = useState(false)
  const [creatingNote, setCreatingNote] = useState(false)

  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [folder, setFolder] = useState<"all" | "trash">("all")
  const [notes, setNotes] = useState<NoteMeta[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [fullNote, setFullNote] = useState<NoteFull | null>(null)

  const [title, setTitle] = useState("")
  const [writtenAt, setWrittenAt] = useState("")
  const [livePayload, setLivePayload] = useState<ContinuumEditorPayload | null>(null)

  const [syncLabel, setSyncLabel] = useState("Listo")
  const [syncStatus, setSyncStatus] = useState<SyncStatusSummary | null>(null)
  const [conflicts, setConflicts] = useState<SyncConflictRecord[]>([])
  const [syncBusy, setSyncBusy] = useState(false)
  const [offline, setOffline] = useState(false)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [editorRevision, setEditorRevision] = useState(0)
  const [referenceSearch, setReferenceSearch] = useState("")
  const [creatingReference, setCreatingReference] = useState(false)
  const [editorMenu, setEditorMenu] = useState({
    isOpen: false,
    x: 0,
    y: 0,
  })

  const editorRef = useRef<Editor | null>(null)
  const mainRef = useRef<HTMLElement | null>(null)
  const debounceRef = useRef<number | undefined>(undefined)
  const offlineRef = useRef(false)
  offlineRef.current = offline

  const selectedRef = useRef<string | null>(null)
  selectedRef.current = selectedId

  const remote = useMemo(() => createContinuumSyncClient(authSession), [authSession])
  const engineRef = useRef<DraftSyncEngine | null>(null)
  const remoteImportSessionRef = useRef("")
  const activeDraft = livePayload?.structuredDraft ?? fullNote?.structuredDraft ?? null
  const hasSelection = editor ? !editor.state.selection.empty : false
  const selectionIncludesInlineMath = useMemo(
    () => (editor ? Boolean(getFirstInlineMathInSelection(editor)) : false),
    [editor, editorRevision],
  )
  const activeCitation = useMemo(
    () => (activeDraft ? getActiveCitationDetails(editor, activeDraft) : null),
    [activeDraft, editor, editorRevision],
  )
  const activeReferenceInsert = useMemo(
    () => (activeDraft ? getActiveReferenceInsertDetails(editor, activeDraft) : null),
    [activeDraft, editor, editorRevision],
  )
  const filteredReferences = useMemo(
    () => filterReferences(activeDraft?.references ?? [], referenceSearch),
    [activeDraft, referenceSearch],
  )
  const selectedReferenceId = activeCitation?.referenceId ?? ""
  const selectedReferenceInsertId = activeReferenceInsert?.referenceId ?? ""
  const canCreateCitation = Boolean(editor && hasSelection && !selectionIncludesInlineMath)
  const canCreateReferenceInsert = Boolean(editor && hasSelection)
  const canCreateInlineMath = Boolean(editor && hasSelection)

  const refreshList = useCallback(async () => {
    if (!repo) {
      return
    }
    const rows = await repo.listNotesMeta({
      folder: folder === "trash" ? "trash" : "all",
    })
    setNotes(rows)
  }, [repo, folder])

  const refreshSyncStatus = useCallback(async () => {
    if (!repo) {
      return
    }
    const [status, openConflicts] = await Promise.all([
      repo.getSyncStatus(),
      repo.listOpenConflicts(),
    ])
    setSyncStatus(status)
    setConflicts(openConflicts)
  }, [repo])

  useEffect(() => {
    if (!editor) {
      return
    }
    const bumpRevision = () => setEditorRevision((value) => value + 1)
    editor.on("selectionUpdate", bumpRevision)
    editor.on("update", bumpRevision)
    bumpRevision()

    return () => {
      editor.off("selectionUpdate", bumpRevision)
      editor.off("update", bumpRevision)
    }
  }, [editor])

  const openEditorMenuAt = useCallback((x: number, y: number) => {
    const position = clampContextMenuPosition(x, y)
    setEditorMenu({ isOpen: true, ...position })
  }, [])

  const closeEditorMenu = useCallback(() => {
    setEditorMenu((current) => ({ ...current, isOpen: false }))
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && editorMenu.isOpen) {
        closeEditorMenu()
        return
      }

      if (!event.metaKey || (event.key !== "9" && event.code !== "Digit9")) {
        return
      }
      event.preventDefault()

      if (editor) {
        try {
          const coords = editor.view.coordsAtPos(editor.state.selection.from)
          openEditorMenuAt(coords.left, coords.bottom + 8)
          return
        } catch {
          // Fall through to the main-pane position.
        }
      }

      const rect = mainRef.current?.getBoundingClientRect()
      openEditorMenuAt(
        rect ? rect.left + Math.min(360, rect.width / 2) : window.innerWidth / 2,
        rect ? rect.top + 96 : window.innerHeight / 3,
      )
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [closeEditorMenu, editor, editorMenu.isOpen, openEditorMenuAt])

  useEffect(() => {
    if (!selectedId) {
      return
    }
    if (notes.length === 0) {
      setSelectedId(null)
      return
    }
    if (!notes.some((note) => note.id === selectedId)) {
      setSelectedId(notes[0]?.id ?? null)
    }
  }, [notes, selectedId])

  useEffect(() => {
    let active = true
    void (async () => {
      let step = "abrir repositorio local"
      try {
        const nextRepo = await openContinuumRepository()
        step = "leer identidad del dispositivo"
        const devId = await nextRepo.ensureDeviceId()
        step = "leer preferencias locales"
        const prefs = await readPreferences()
        step = "leer sesion de Diario"
        const session = await readDiarioAuthSession()
        if (!active) {
          return
        }
        setRepo(nextRepo)
        setDeviceId(devId)
        setSidebarVisible(prefs.sidebarVisible)
        setAuthSession(session)
        setAuthLoaded(true)
        step = "leer biblioteca local"
        const list = await nextRepo.listNotesMeta({ folder: "all" })
        if (!active) {
          return
        }
        setNotes(list)
        const [status, openConflicts] = await Promise.all([
          nextRepo.getSyncStatus(),
          nextRepo.listOpenConflicts(),
        ])
        setSyncStatus(status)
        setConflicts(openConflicts)
        const initialId =
          prefs.lastOpenedNoteId &&
          list.some((note) => note.id === prefs.lastOpenedNoteId)
            ? prefs.lastOpenedNoteId
            : list[0]?.id ?? null
        setSelectedId(initialId)
        step = "leer borrador de emergencia"
        const emergency = await readEmergencyDraft()
        if (emergency && initialId && emergency.noteId === initialId) {
          step = "comparar borrador de emergencia"
          const base = await nextRepo.getNoteById(initialId)
          if (
            base &&
            emergencyIsNewer(
              {
                noteId: emergency.noteId,
                savedAtMs: emergency.savedAtMs,
                localVersion: emergency.localVersion,
                structuredDraft: emergency.structuredDraft,
                tiptapJson: emergency.tiptapJson,
              },
              base.updatedAt,
            )
          ) {
            const accept = window.confirm(
              "Hay un borrador de emergencia más nuevo que la copia local. ¿Restaurarlo?",
            )
            if (accept) {
              await nextRepo.saveNote({
                structuredDraft: emergency.structuredDraft,
                tiptapJson: emergency.tiptapJson,
                deviceId: devId,
                bumpLocalVersion: true,
                syncState: offlineRef.current ? "offline" : "dirty",
              })
            }
          }
        }
      } catch (error) {
        console.error(error)
        if (active) {
          setBootstrapError(`${step}: ${bootstrapErrorMessage(error)}`)
          setAuthLoaded(true)
        }
      }
    })()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!repo || !authSession) {
      return
    }
    void refreshList()
    void refreshSyncStatus()
  }, [repo, folder, refreshList, refreshSyncStatus])

  useEffect(() => {
    if (!repo || !authSession) {
      return
    }
    const id = window.setInterval(() => {
      void refreshSyncStatus()
    }, 5000)
    return () => window.clearInterval(id)
  }, [authSession, refreshSyncStatus, repo])

  useEffect(() => {
    if (!repo || !authSession || !deviceId || !remote.client.listRemoteDrafts) {
      return
    }
    const importKey = `${authSession.baseUrl}:${authSession.userEmail}`
    if (remoteImportSessionRef.current === importKey) {
      return
    }
    remoteImportSessionRef.current = importKey
    let cancelled = false

    void (async () => {
      setSyncLabel("Importando Diario…")
      try {
        const drafts = await remote.client.listRemoteDrafts?.()
        let imported = 0
        for (const draft of drafts ?? []) {
          if (cancelled) {
            return
          }
          const existing = await repo.getNoteById(draft.noteId)
          if (existing && hasUnpushedLocalState(existing)) {
            continue
          }
          const prototype = continuumBootstrapPrototype(draft.structuredDraft)
          await repo.saveNote({
            bumpLocalVersion: false,
            deviceId,
            remoteVersion: draft.remoteVersion,
            slug: draft.slug,
            structuredDraft: draft.structuredDraft,
            syncState: "synced",
            tiptapJson: draft.tiptapJson ?? prototype.tiptap,
          })
          imported += 1
        }
        if (!cancelled) {
          const list = await repo.listNotesMeta({ folder: "all" })
          setNotes(list)
          if (!selectedRef.current) {
            setSelectedId(list[0]?.id ?? null)
          }
          await refreshSyncStatus()
          setSyncLabel(imported > 0 ? `Importadas ${imported}` : "Diario al día")
        }
      } catch (error) {
        console.error(error)
        if (!cancelled) {
          setSyncLabel("No se pudo importar Diario")
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [authSession, deviceId, refreshList, refreshSyncStatus, remote.client, repo])

  useEffect(() => {
    if (!repo || !selectedId) {
      setFullNote(null)
      return
    }
    let cancelled = false
    void repo.getNoteById(selectedId).then((note) => {
      if (!cancelled) {
        setFullNote(note)
      }
    })
    void writePreferences({ lastOpenedNoteId: selectedId })
    return () => {
      cancelled = true
    }
  }, [repo, selectedId])

  useEffect(() => {
    if (!fullNote) {
      return
    }
    setTitle(fullNote.structuredDraft.title)
    setWrittenAt(fullNote.structuredDraft.writtenAt || fullNote.writtenAt)
  }, [fullNote])

  useEffect(() => {
    if (!repo) {
      return
    }
    const engine = new DraftSyncEngine(
      {
        client: remote.client,
        isOffline: () => offlineRef.current,
        pollDirtyIds: () => repo.listDirtyIds(),
        loadNote: async (id) => {
          const note = await repo.getNoteById(id)
          if (!note) {
            return null
          }
          return {
            deviceId: note.deviceId,
            id: note.id,
            localVersion: note.localVersion,
            remoteVersion: note.remoteVersion,
            slug: note.slug,
            structuredDraft: note.structuredDraft,
            syncState: note.syncState,
            tiptapJson: note.tiptapJson,
          }
        },
        applyRemoteSuccess: async (noteId, remoteVersion) => {
          await repo.applyRemoteSynced({ noteId, remoteVersion })
          setSyncLabel(
            remote.mode === "http" ? "Sincronizado online" : "Sincronizado (mock)",
          )
          await refreshList()
          await refreshSyncStatus()
          if (noteId === selectedRef.current) {
            const next = await repo.getNoteById(noteId)
            setFullNote(next)
          }
        },
        markState: async (noteId, state) => {
          await repo.markSyncState(noteId, state as never)
          await refreshSyncStatus()
          if (state === "syncing") {
            setSyncLabel("Subiendo a Diario...")
          }
          if (state === "offline") {
            setSyncLabel("Sin conexión")
          }
          if (state === "error") {
            setSyncLabel("Pendiente de reintento")
          }
        },
        onConflict: async (noteId, error) => {
          const local = await repo.getNoteById(noteId)
          await repo.recordConflict(noteId, local, normalizeConflictPayload(error))
          await refreshSyncStatus()
          setSyncLabel("Conflicto remoto")
        },
        onError: async (noteId, error) => {
          await repo.recordSyncFailure(noteId, error)
          await refreshSyncStatus()
          setSyncLabel(
            remote.mode === "http" ? "Error sync Diario" : "Error sync mock",
          )
        },
      },
      { intervalMs: 15000 },
    )
    engine.start()
    engineRef.current = engine
    return () => {
      engine.stop()
      engineRef.current = null
    }
  }, [authSession, refreshList, refreshSyncStatus, remote, repo])

  const flushAutosaveTimer = () => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current)
      debounceRef.current = undefined
    }
  }

  const runSave = useCallback(
    async (payload: ContinuumEditorPayload, options: { manual: boolean }) => {
      if (!repo || !selectedId || !deviceId) {
        return
      }
      const saved = await repo.saveNote({
        bumpLocalVersion: true,
        deviceId,
        structuredDraft: payload.structuredDraft,
        syncState: offline ? "offline" : "dirty",
        tiptapJson: payload.tiptapJson,
      })
      await writeEmergencyDraft({
        localVersion: saved.localVersion,
        noteId: selectedId,
        savedAtMs: Date.now(),
        structuredDraft: payload.structuredDraft,
        tiptapJson: payload.tiptapJson,
      })
      if (options.manual) {
        setSyncLabel(offline ? "Borrador local" : "Sincronizando…")
        const result = await engineRef.current?.syncNote(selectedId)
        await clearEmergencyDraft()
        if (!result || result.status === "skipped") {
          setSyncLabel("Guardado local")
        } else if (result.status === "offline") {
          setSyncLabel("Sin conexión")
        } else if (result.status === "success") {
          setSyncLabel(
            remote.mode === "http" ? "Sincronizado online" : "Sincronizado (mock)",
          )
        } else if (result.status === "conflict") {
          setSyncLabel("Conflicto remoto")
        } else {
          setSyncLabel("Pendiente de reintento")
        }
      } else {
        setSyncLabel(offline ? "Sin conexión" : "Guardado")
        await clearEmergencyDraft()
      }
      const shouldSnapshot = options.manual || saved.localVersion % 2 === 0
      if (shouldSnapshot) {
        await repo.appendRevision(selectedId)
      }
      await refreshList()
      await refreshSyncStatus()
      if (selectedRef.current === selectedId) {
        setFullNote(saved)
      }
    },
    [deviceId, offline, refreshList, refreshSyncStatus, remote.mode, repo, selectedId],
  )

  const scheduleAutosave = useCallback(
    (payload: ContinuumEditorPayload) => {
      flushAutosaveTimer()
      debounceRef.current = window.setTimeout(() => {
        void runSave(payload, { manual: false })
      }, 750)
      void writeEmergencyDraft({
        localVersion: fullNote?.localVersion ?? 0,
        noteId: selectedId ?? payload.structuredDraft.id,
        savedAtMs: Date.now(),
        structuredDraft: payload.structuredDraft,
        tiptapJson: payload.tiptapJson,
      })
    },
    [fullNote?.localVersion, runSave, selectedId],
  )

  useEffect(() => {
    return () => flushAutosaveTimer()
  }, [])

  const handleEditorPayload = useCallback(
    (payload: ContinuumEditorPayload) => {
      setLivePayload(payload)
      scheduleAutosave(payload)
    },
    [scheduleAutosave],
  )

  const handleToggleSidebar = () => {
    const next = !sidebarVisible
    setSidebarVisible(next)
    void writePreferences({ sidebarVisible: next })
  }

  const handleCreateNote = async () => {
    if (!repo || !deviceId || creatingNote) {
      return
    }
    setCreatingNote(true)
    try {
      const draft = createNewStructuredNoteDraft(new Date(), [])
      const prototype = continuumBootstrapPrototype(draft)
      const saved = await repo.saveNote({
        bumpLocalVersion: true,
        deviceId,
        structuredDraft: draft,
        slug: draft.id,
        syncState: offline ? "offline" : "dirty",
        tiptapJson: prototype.tiptap,
      })
      setFolder("all")
      setSelectedId(saved.id)
      await refreshList()
      await refreshSyncStatus()
    } finally {
      setCreatingNote(false)
    }
  }

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoginError(null)
    setLoginSubmitting(true)
    try {
      const session = await loginToDiario({
        baseUrl: loginBaseUrl,
        email: loginEmail,
        password: loginPassword,
      })
      await saveDiarioAuthSession(session)
      setAuthSession(session)
      setLoginBaseUrl(session.baseUrl)
      setLoginPassword("")
      setSyncLabel("Listo")
    } catch (error) {
      setLoginError(bootstrapErrorMessage(error))
    } finally {
      setLoginSubmitting(false)
    }
  }

  const handleLogout = async () => {
    const session = authSession
    setAuthSession(null)
    setSyncLabel("Listo")
    await clearDiarioAuthSession()
    if (session) {
      await logoutFromDiario(session).catch(() => undefined)
    }
  }

  const handleManualSave = async () => {
    if (!livePayload) {
      return
    }
    flushAutosaveTimer()
    await runSave(livePayload, { manual: true })
  }

  const handleRetrySyncNow = async () => {
    if (!repo || syncBusy) {
      return
    }
    setSyncBusy(true)
    setSyncLabel("Reintentando…")
    try {
      await repo.retrySyncNow()
      await engineRef.current?.flushDirty()
      await refreshList()
      await refreshSyncStatus()
    } finally {
      setSyncBusy(false)
    }
  }

  const handleKeepLocalConflict = async () => {
    if (!repo || !selectedId || !fullNote || syncBusy) {
      return
    }
    const conflict = conflicts.find((item) => item.noteId === selectedId)
    if (!conflict) {
      return
    }
    setSyncBusy(true)
    setSyncLabel("Resolviendo conflicto…")
    try {
      const remoteVersion =
        getConflictRemoteVersion(conflict) ??
        (await remote.client.fetchRemoteMeta(selectedId))?.remoteVersion ??
        fullNote.remoteVersion
      await repo.appendRevision(selectedId)
      await repo.resolveConflictKeepLocal(selectedId, remoteVersion)
      await refreshList()
      await refreshSyncStatus()
      const result = await engineRef.current?.syncNote(selectedId)
      if (result?.status === "success") {
        setSyncLabel("Sincronizado online")
      } else if (result?.status === "conflict") {
        setSyncLabel("Conflicto remoto")
      } else {
        setSyncLabel("Pendiente de reintento")
      }
      const next = await repo.getNoteById(selectedId)
      setFullNote(next)
      await refreshList()
      await refreshSyncStatus()
    } finally {
      setSyncBusy(false)
    }
  }

  const handleUseRemoteConflict = async () => {
    if (!repo || !selectedId || !fullNote || syncBusy) {
      return
    }
    const conflict = conflicts.find((item) => item.noteId === selectedId)
    if (!conflict) {
      return
    }
    setSyncBusy(true)
    setSyncLabel("Aplicando remoto…")
    try {
      const remoteDraft =
        getConflictRemoteDraft(conflict) ??
        (await remote.client.fetchRemoteDraft?.(selectedId))
      if (!remoteDraft) {
        setSyncLabel("Remoto no disponible")
        return
      }
      await repo.resolveConflictUseRemote({
        noteId: selectedId,
        remoteVersion: remoteDraft.remoteVersion,
        structuredDraft: remoteDraft.structuredDraft,
        tiptapJson:
          remoteDraft.tiptapJson ??
          continuumBootstrapPrototype(remoteDraft.structuredDraft).tiptap,
      })
      await refreshList()
      await refreshSyncStatus()
      const next = await repo.getNoteById(selectedId)
      setFullNote(next)
      setSyncLabel("Remoto aplicado")
    } finally {
      setSyncBusy(false)
    }
  }

  const handleDuplicateLocalConflict = async () => {
    if (!repo || !selectedId || !fullNote || !deviceId || syncBusy) {
      return
    }
    const conflict = conflicts.find((item) => item.noteId === selectedId)
    if (!conflict) {
      return
    }
    setSyncBusy(true)
    setSyncLabel("Duplicando local…")
    try {
      const remoteDraft =
        getConflictRemoteDraft(conflict) ??
        (await remote.client.fetchRemoteDraft?.(selectedId))
      const duplicate = await repo.duplicateNoteAsLocalDraft(
        selectedId,
        deviceId,
        (draft) => continuumBootstrapPrototype(draft).tiptap,
      )
      if (remoteDraft) {
        await repo.resolveConflictUseRemote({
          noteId: selectedId,
          remoteVersion: remoteDraft.remoteVersion,
          structuredDraft: remoteDraft.structuredDraft,
          tiptapJson:
            remoteDraft.tiptapJson ??
            continuumBootstrapPrototype(remoteDraft.structuredDraft).tiptap,
        })
      }
      if (duplicate) {
        setSelectedId(duplicate.id)
        setFullNote(duplicate)
        setSyncLabel(remoteDraft ? "Local duplicado" : "Local duplicado; conflicto pendiente")
      } else {
        setSyncLabel("No se pudo duplicar")
      }
      await refreshList()
      await refreshSyncStatus()
    } finally {
      setSyncBusy(false)
    }
  }

  const handleTrash = async () => {
    if (!repo || !selectedId || folder !== "all") {
      return
    }
    flushAutosaveTimer()
    await repo.moveToTrash(selectedId)
    setSelectedId(null)
    await refreshList()
    await refreshSyncStatus()
  }

  const handleRestore = async () => {
    if (!repo || !selectedId || folder !== "trash") {
      return
    }
    await repo.restoreFromTrash(selectedId)
    setFolder("all")
    await refreshList()
    await refreshSyncStatus()
  }

  const handleAddReference = async (
    input: ContinuumEditorMenuReferenceInput = {
      author: "",
      body: "Nueva referencia",
      work: "",
    },
    mode: "library" | "active-target" = "library",
  ) => {
    const sourceDraft = livePayload?.structuredDraft ?? fullNote?.structuredDraft

    if (!repo || !fullNote || !sourceDraft || !deviceId) {
      return
    }
    setCreatingReference(true)
    const refId = makeId("reference")
    const body = input.body.trim() || "Nueva referencia"
    const nextDraft = normalizeStructuredNoteDraft({
      ...sourceDraft,
      references: [
        ...sourceDraft.references,
        {
          ...(input.author.trim() ? { author: input.author.trim() } : {}),
          body,
          ...(input.work.trim() ? { work: input.work.trim() } : {}),
          id: refId,
        },
      ],
    })
    try {
      let saved = await repo.saveNote({
        bumpLocalVersion: true,
        deviceId,
        structuredDraft: nextDraft,
        syncState: offline ? "offline" : "dirty",
        tiptapJson: livePayload?.tiptapJson ?? fullNote.tiptapJson,
      })

      if (mode === "active-target") {
        if (activeCitation) {
          associateReferenceWithActiveCitation(editorRef.current, refId)
        } else if (activeReferenceInsert) {
          associateReferenceWithActiveReferenceInsert(editorRef.current, refId, nextDraft)
        }
        flushAutosaveTimer()

        const tiptapJson: TipTapJsonNode = (
          editorRef.current?.getJSON() ??
          livePayload?.tiptapJson ??
          fullNote.tiptapJson
        ) as TipTapJsonNode
        const associatedDraft = normalizeStructuredNoteDraft(
          createStructuredDraftFromTipTapPrototypeDocument({
            sourceDraft: nextDraft,
            tiptap: tiptapJson,
          }),
        )
        saved = await repo.saveNote({
          bumpLocalVersion: true,
          deviceId,
          structuredDraft: associatedDraft,
          syncState: offline ? "offline" : "dirty",
          tiptapJson,
        })
        setLivePayload({ structuredDraft: associatedDraft, tiptapJson })
      }

      setFullNote(saved)
      setReferenceSearch("")
      await refreshList()
      await refreshSyncStatus()
    } finally {
      setCreatingReference(false)
    }
  }

  if (bootstrapError) {
    return (
      <div className="continuum-shell">
        <p className="continuum-error">{bootstrapError}</p>
        <p className="continuum-help">
          Ejecutá la app con <code>pnpm tauri:dev</code> para habilitar SQLite embebido.
        </p>
      </div>
    )
  }

  if (!repo || !authLoaded) {
    return (
      <div className="continuum-shell continuum-loading">
        <p>Cargando biblioteca…</p>
      </div>
    )
  }

  if (!authSession) {
    return (
      <div className="continuum-shell continuum-auth-shell">
        <form className="continuum-login" onSubmit={handleLogin}>
          <h1>Continuum</h1>
          <label>
            Diario
            <input
              type="url"
              value={loginBaseUrl}
              onChange={(event) => setLoginBaseUrl(event.target.value)}
              autoComplete="url"
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={loginEmail}
              onChange={(event) => setLoginEmail(event.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {loginError ? <p className="continuum-login-error">{loginError}</p> : null}
          <button type="submit" disabled={loginSubmitting}>
            {loginSubmitting ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    )
  }

  if (!selectedId) {
    return (
      <div className="continuum-shell">
        {sidebarVisible ? (
          <aside className="continuum-sidebar">
            <header className="continuum-brand">
              <span>Continuum</span>
              <button type="button" onClick={handleToggleSidebar} aria-label="Ocultar panel">
                ⟨
              </button>
            </header>
            <nav className="continuum-folders">
              <button
                type="button"
                className={folder === "all" ? "active" : ""}
                onClick={() => setFolder("all")}
              >
                Todas
              </button>
              <button
                type="button"
                className={folder === "trash" ? "active" : ""}
                onClick={() => setFolder("trash")}
              >
                Papelera
              </button>
            </nav>
            <div className="continuum-list" />
            <button
              type="button"
              className="continuum-new-note"
              disabled={creatingNote}
              onClick={handleCreateNote}
            >
              Nueva nota
            </button>
          </aside>
        ) : (
          <button
            type="button"
            className="continuum-show-sidebar"
            onClick={handleToggleSidebar}
            aria-label="Mostrar panel"
          >
            ⟩
          </button>
        )}
        <main className="continuum-main continuum-empty">
          <p>No hay notas seleccionadas.</p>
          <button type="button" disabled={creatingNote} onClick={handleCreateNote}>
            {creatingNote ? "Creando…" : "Crear nota"}
          </button>
        </main>
      </div>
    )
  }

  if (!fullNote) {
    return (
      <div className="continuum-shell continuum-loading">
        <p>Cargando nota…</p>
      </div>
    )
  }

  const prototype = continuumBootstrapPrototype(fullNote.structuredDraft)
  const selectedConflict = conflicts.find((conflict) => conflict.noteId === selectedId)
  const retryTime = formatRetryTime(syncStatus?.nextRetryAt ?? null)

  return (
    <div className="continuum-shell">
      {sidebarVisible ? (
        <aside className="continuum-sidebar">
          <header className="continuum-brand">
            <span>Continuum</span>
            <button type="button" onClick={handleToggleSidebar} aria-label="Ocultar panel">
              ⟨
            </button>
          </header>
          <nav className="continuum-folders">
            <button
              type="button"
              className={folder === "all" ? "active" : ""}
              onClick={() => setFolder("all")}
            >
              Todas
            </button>
            <button
              type="button"
              className={folder === "trash" ? "active" : ""}
              onClick={() => setFolder("trash")}
            >
              Papelera
            </button>
          </nav>
          <div className="continuum-list">
            {notes.map((note) => (
              <button
                key={note.id}
                type="button"
                className={note.id === selectedId ? "active" : ""}
                onClick={() => setSelectedId(note.id)}
              >
                <div className="continuum-list-date">{note.writtenAt}</div>
                <div className="continuum-list-title">
                  {note.title?.trim() || note.excerpt || "Borrador"}
                </div>
                <div
                  className={`continuum-list-sync continuum-list-sync--${note.syncState}`}
                >
                  {syncStateLabel(note.syncState)}
                </div>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="continuum-new-note"
            disabled={creatingNote}
            onClick={handleCreateNote}
          >
            Nueva nota
          </button>
        </aside>
      ) : (
        <button
          type="button"
          className="continuum-show-sidebar"
          onClick={handleToggleSidebar}
          aria-label="Mostrar panel"
        >
          ⟩
        </button>
      )}

      <main className="continuum-main" ref={mainRef}>
        <ContinuumEditorMenu
          activeCitation={activeCitation}
          activeReferenceInsert={activeReferenceInsert}
          canCreateCitation={canCreateCitation}
          canCreateInlineMath={canCreateInlineMath}
          canCreateReferenceInsert={canCreateReferenceInsert}
          canRetrySync={Boolean(syncStatus?.pendingCount)}
          creatingReference={creatingReference}
          filteredReferences={filteredReferences}
          folder={folder}
          isOpen={editorMenu.isOpen}
          offline={offline}
          onAddCitation={() => addCitationToSelection(editorRef.current)}
          onAddReference={handleAddReference}
          onAssociateCitationReference={(referenceId) => {
            if (referenceId) {
              associateReferenceWithActiveCitation(editorRef.current, referenceId)
            } else {
              clearReferenceFromActiveCitation(editorRef.current)
            }
          }}
          onAssociateReferenceInsertReference={(referenceId) => {
            if (!activeDraft) {
              return
            }
            if (referenceId) {
              associateReferenceWithActiveReferenceInsert(
                editorRef.current,
                referenceId,
                activeDraft,
              )
            } else {
              clearReferenceFromActiveReferenceInsert(editorRef.current, activeDraft)
            }
          }}
          onClearCitationReference={() => clearReferenceFromActiveCitation(editorRef.current)}
          onClearReferenceInsertReference={() => {
            if (activeDraft) {
              clearReferenceFromActiveReferenceInsert(editorRef.current, activeDraft)
            }
          }}
          onClose={closeEditorMenu}
          onConvertInlineMath={() => convertMarkdownInlineMath(editorRef.current)}
          onCreateReferenceInsert={() => convertSelectionToReferenceInsert(editorRef.current)}
          onLogout={handleLogout}
          onManualSave={handleManualSave}
          onReferenceSearchChange={setReferenceSearch}
          onRemoveCitation={() => removeCitationFromSelection(editorRef.current)}
          onRestore={handleRestore}
          onRetrySync={handleRetrySyncNow}
          onSetOffline={setOffline}
          onTrash={handleTrash}
          onMarkAllParagraphsAsAphorisms={() =>
            markAllParagraphsAsAphorisms(editorRef.current)
          }
          onToggleAphorism={() => markCurrentBlockAsAphorism(editorRef.current)}
          onTitleChange={setTitle}
          onWrittenAtChange={setWrittenAt}
          referenceSearch={referenceSearch}
          remoteLabel={remote.label}
          remoteMode={remote.mode}
          retryTime={retryTime}
          selectedReferenceId={selectedReferenceId}
          selectedReferenceInsertId={selectedReferenceInsertId}
          syncBusy={syncBusy}
          syncConflictCount={syncStatus?.conflictCount ?? 0}
          syncLabel={syncLabel}
          syncPendingCount={syncStatus?.pendingCount ?? 0}
          title={title}
          writtenAt={writtenAt}
          x={editorMenu.x}
          y={editorMenu.y}
        />
        {selectedConflict ? (
          <section className="continuum-conflict-panel">
            <div>
              <strong>Conflicto remoto</strong>
              <p>
                Esta nota cambió online antes de subir tu versión local. Podés
                conservar tu copia, usar la versión online o duplicar tu copia local.
              </p>
            </div>
            <div className="continuum-conflict-actions">
              <button
                type="button"
                disabled={syncBusy}
                onClick={handleKeepLocalConflict}
              >
                Conservar local
              </button>
              <button
                type="button"
                disabled={syncBusy}
                onClick={handleUseRemoteConflict}
              >
                Usar remoto
              </button>
              <button
                type="button"
                disabled={syncBusy}
                onClick={handleDuplicateLocalConflict}
              >
                Duplicar local
              </button>
              <button
                type="button"
                disabled={syncBusy}
                onClick={() => setSyncLabel("Conflicto pendiente")}
              >
                Dejar pendiente
              </button>
            </div>
          </section>
        ) : null}

        <ContinuumEditor
          initialDraft={fullNote.structuredDraft}
          initialPrototype={prototype}
          noteId={fullNote.id}
          onPayload={handleEditorPayload}
          onReady={(editor) => {
            editorRef.current = editor
            setEditor(editor)
          }}
          onTitleChange={setTitle}
          onWrittenAtChange={setWrittenAt}
          showMetadataControls={false}
          title={title}
          writtenAt={writtenAt}
        />
      </main>
    </div>
  )
}
