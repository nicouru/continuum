import type { Editor } from "@tiptap/core"
import type { StructuredNoteDraft } from "@continuum/core"
import {
  createNewStructuredNoteDraft,
  excerptFromPlainText,
  extractStructuredDraftVisiblePlainText,
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
  getActiveBlockDetails,
  getActiveCitationDetails,
  getActiveReferenceInsertDetails,
  getFirstInlineMathInSelection,
  joinCurrentBlockToPreviousAphorism,
  makeId,
  markAllParagraphsAsAphorisms,
  markCurrentBlockAsAphorism,
  removeCitationFromSelection,
  separateAphorismFromCurrentBlock,
  unmarkCurrentBlockAsAphorism,
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
import type { FormEvent, MouseEvent as ReactMouseEvent } from "react"
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
import brandLogoBlackUrl from "./assets/brand/logo-serpiente-black-64.png"
import brandLogoUrl from "./assets/brand/logo-serpiente-white-64.png"
import "./App.css"

const SIDEBAR_MIN_WIDTH = 250
const SIDEBAR_MAX_WIDTH = 460
const SIDEBAR_DEFAULT_WIDTH = 320

const MONTHS_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Setiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
]

function clampSidebarWidth(value: number) {
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(value, SIDEBAR_MAX_WIDTH))
}

function formatDiaryDate(value: string) {
  const [year, month, day] = value.split("-").map(Number)

  if (!year || !month || !day || !MONTHS_ES[month - 1]) {
    return value
  }

  return `${day} de ${MONTHS_ES[month - 1]} de ${year}`
}

function getNotePreviewText(note: NoteMeta) {
  return note.plainText.trim() || note.excerpt.trim()
}

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

function clampFloatingMenuPosition(
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const margin = 10
  const menuWidth = Math.min(width, window.innerWidth - margin * 2)
  const menuHeight = Math.min(height, window.innerHeight - margin * 2)

  return {
    x: Math.max(margin, Math.min(x, window.innerWidth - menuWidth - margin)),
    y: Math.max(margin, Math.min(y, window.innerHeight - menuHeight - margin)),
  }
}

function clampContextMenuPosition(x: number, y: number) {
  return clampFloatingMenuPosition(x, y, 430, 720)
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

function parseOptionalIntegerInput(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }
  const parsed = Number(trimmed)
  return Number.isInteger(parsed) ? parsed : undefined
}

function textDocumentFromTextarea(value: string, idPrefix: string) {
  const blocks = value
    .split(/\n\s*\n/g)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((text, index) => ({
      id: `${idPrefix}-${index + 1}`,
      segments: [{ id: `${idPrefix}-${index + 1}-text`, text, type: "text" as const }],
      text,
      type: "paragraph" as const,
    }))

  return blocks.length ? { blocks } : undefined
}

function getConflictPreview(draft: StructuredNoteDraft, version: number) {
  return {
    excerpt:
      excerptFromPlainText(extractStructuredDraftVisiblePlainText(draft)) ||
      "Sin texto",
    title: draft.title.trim() || "Sin titulo",
    version,
    writtenAt: draft.writtenAt,
  }
}

function NewNoteIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M5 5h10.5" />
      <path d="M5 5v14h14V8.5" />
      <path d="M9 15l1.1-3.7 6.6-6.6 2.6 2.6-6.6 6.6z" />
      <path d="M15.5 5.9l2.6 2.6" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M4 7h16" />
      <path d="M9 7V4.5h6V7" />
      <path d="M6.5 7l1 12.5h9L17.5 7" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  )
}

function BrandMark() {
  return (
    <span className="continuum-brand-mark">
      <img
        className="continuum-brand-mark-dark"
        src={brandLogoUrl}
        alt=""
        width="22"
        height="22"
      />
      <img
        className="continuum-brand-mark-light"
        src={brandLogoBlackUrl}
        alt=""
        width="22"
        height="22"
      />
      <span>Continuum</span>
    </span>
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

  const [appearanceMode, setAppearanceMode] = useState<"dark" | "light">("dark")
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH)
  const [sidebarSelectionFocus, setSidebarSelectionFocus] = useState(false)
  const [newlyCreatedNoteId, setNewlyCreatedNoteId] = useState<string | null>(null)
  const [folder, setFolder] = useState<"all" | "trash">("all")
  const [notes, setNotes] = useState<NoteMeta[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([])
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null)
  const [fullNote, setFullNote] = useState<NoteFull | null>(null)

  const [title, setTitle] = useState("")
  const [writtenAt, setWrittenAt] = useState("")
  const [livePayload, setLivePayload] = useState<ContinuumEditorPayload | null>(null)
  const livePayloadRef = useRef<ContinuumEditorPayload | null>(null)

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
  const [noteMenu, setNoteMenu] = useState<{
    isOpen: boolean
    noteIds: string[]
    x: number
    y: number
  }>({
    isOpen: false,
    noteIds: [],
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
  const selectedNoteIdSet = useMemo(
    () => new Set(selectedNoteIds),
    [selectedNoteIds],
  )
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
  const activeBlock = useMemo(
    () => (activeDraft ? getActiveBlockDetails(editor, activeDraft) : null),
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
  const canModifyAphorism = Boolean(editor && activeBlock?.aphorismId)
  const isPublished = fullNote?.status === "published"
  const canPublish = Boolean(
    fullNote &&
      folder === "all" &&
      !syncBusy &&
      !offline &&
      (isPublished ? remote.client.unpublishNote : remote.client.publishNote),
  )
  const selectedVisibleNoteIds = useMemo(() => {
    const visibleIds = new Set(notes.map((note) => note.id))
    return selectedNoteIds.filter((id) => visibleIds.has(id))
  }, [notes, selectedNoteIds])

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

  const closeNoteMenu = useCallback(() => {
    setNoteMenu((current) => ({ ...current, isOpen: false, noteIds: [] }))
  }, [])

  const handleEditorContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      event.preventDefault()
      event.stopPropagation()
      closeNoteMenu()
      setSidebarSelectionFocus(false)
      openEditorMenuAt(event.clientX, event.clientY)
    },
    [closeNoteMenu, openEditorMenuAt],
  )

  const openNoteMenuAt = useCallback((x: number, y: number, noteIds: string[]) => {
    const position = clampFloatingMenuPosition(x, y, 240, 56)
    setNoteMenu({ isOpen: true, noteIds, ...position })
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && noteMenu.isOpen) {
        closeNoteMenu()
        return
      }

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
  }, [
    closeEditorMenu,
    closeNoteMenu,
    editor,
    editorMenu.isOpen,
    noteMenu.isOpen,
    openEditorMenuAt,
  ])

  useEffect(() => {
    const visibleIds = new Set(notes.map((note) => note.id))
    setSelectedNoteIds((current) => {
      const next = current.filter((id) => visibleIds.has(id))
      return next.length === current.length ? current : next
    })
    if (selectionAnchorId && !visibleIds.has(selectionAnchorId)) {
      setSelectionAnchorId(null)
    }
    if (notes.length === 0) {
      setSelectedId(null)
      setSelectedNoteIds([])
      setSelectionAnchorId(null)
      return
    }
    if (!selectedId || !visibleIds.has(selectedId)) {
      const nextId = notes[0]?.id ?? null
      setSelectedId(nextId)
      setSelectedNoteIds(nextId ? [nextId] : [])
      setSelectionAnchorId(nextId)
      return
    }
    if (selectedNoteIds.length === 0) {
      setSelectedNoteIds([selectedId])
      setSelectionAnchorId(selectedId)
    }
  }, [notes, selectedId, selectedNoteIds.length, selectionAnchorId])

  useEffect(() => {
    if (!newlyCreatedNoteId) {
      return
    }
    const id = window.setTimeout(() => setNewlyCreatedNoteId(null), 700)
    return () => window.clearTimeout(id)
  }, [newlyCreatedNoteId])

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
        setAppearanceMode(prefs.appearanceMode)
        setSidebarVisible(prefs.sidebarVisible)
        setSidebarWidth(clampSidebarWidth(prefs.sidebarWidth))
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
        rebaseLocalRemoteVersion: async (noteId, remoteVersion) => {
          await repo.resolveConflictKeepLocal(noteId, remoteVersion)
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

  const flushPendingAutosave = useCallback(async () => {
    const hadPendingAutosave = Boolean(debounceRef.current)
    const payload = livePayloadRef.current
    flushAutosaveTimer()
    if (hadPendingAutosave && payload) {
      await runSave(payload, { manual: false })
    }
  }, [runSave])

  const flushPendingWorkOnline = useCallback(async () => {
    await flushPendingAutosave()
    if (offlineRef.current) {
      return
    }
    await engineRef.current?.flushDirty()
    await refreshList()
    await refreshSyncStatus()
  }, [flushPendingAutosave, refreshList, refreshSyncStatus])

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

  useEffect(() => {
    const flush = () => {
      void flushPendingWorkOnline()
    }
    const flushWhenVisible = () => {
      if (document.visibilityState === "visible") {
        flush()
      }
    }

    window.addEventListener("focus", flush)
    window.addEventListener("online", flush)
    window.addEventListener("pagehide", flush)
    document.addEventListener("visibilitychange", flushWhenVisible)

    return () => {
      window.removeEventListener("focus", flush)
      window.removeEventListener("online", flush)
      window.removeEventListener("pagehide", flush)
      document.removeEventListener("visibilitychange", flushWhenVisible)
    }
  }, [flushPendingWorkOnline])

  const handleEditorPayload = useCallback(
    (payload: ContinuumEditorPayload) => {
      livePayloadRef.current = payload
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

  const handleSetAppearanceMode = (value: "dark" | "light") => {
    setAppearanceMode(value)
    void writePreferences({ appearanceMode: value })
  }

  const handleSidebarResizeMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = sidebarWidth
    document.body.classList.add("continuum-sidebar-is-resizing")

    const handleMove = (moveEvent: MouseEvent) => {
      setSidebarWidth(clampSidebarWidth(startWidth + moveEvent.clientX - startX))
    }

    const handleUp = (upEvent: MouseEvent) => {
      const nextWidth = clampSidebarWidth(startWidth + upEvent.clientX - startX)
      setSidebarWidth(nextWidth)
      void writePreferences({ sidebarWidth: nextWidth })
      document.body.classList.remove("continuum-sidebar-is-resizing")
      window.removeEventListener("mousemove", handleMove)
      window.removeEventListener("mouseup", handleUp)
    }

    window.addEventListener("mousemove", handleMove)
    window.addEventListener("mouseup", handleUp)
  }

  const handleSelectNoteFromList = (
    event: ReactMouseEvent<HTMLButtonElement>,
    noteId: string,
  ) => {
    closeNoteMenu()
    setSidebarSelectionFocus(true)
    setSelectedId(noteId)

    if (event.shiftKey) {
      const anchor = selectionAnchorId ?? selectedId ?? noteId
      const anchorIndex = notes.findIndex((note) => note.id === anchor)
      const noteIndex = notes.findIndex((note) => note.id === noteId)
      if (anchorIndex >= 0 && noteIndex >= 0) {
        const [start, end] =
          anchorIndex < noteIndex ? [anchorIndex, noteIndex] : [noteIndex, anchorIndex]
        setSelectedNoteIds(notes.slice(start, end + 1).map((note) => note.id))
        return
      }
    }

    if (event.metaKey || event.ctrlKey) {
      setSelectedNoteIds((current) => {
        const exists = current.includes(noteId)
        const next = exists
          ? current.filter((id) => id !== noteId)
          : [...current, noteId]
        return next.length ? next : [noteId]
      })
      setSelectionAnchorId(noteId)
      return
    }

    setSelectedNoteIds([noteId])
    setSelectionAnchorId(noteId)
  }

  const handleNoteContextMenu = (
    event: ReactMouseEvent<HTMLButtonElement>,
    noteId: string,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    closeEditorMenu()
    setSidebarSelectionFocus(true)

    const noteIsInSelection = selectedVisibleNoteIds.includes(noteId)
    const targetIds =
      noteIsInSelection && selectedVisibleNoteIds.length > 0
        ? selectedVisibleNoteIds
        : [noteId]

    if (!noteIsInSelection) {
      setSelectedId(noteId)
      setSelectedNoteIds([noteId])
      setSelectionAnchorId(noteId)
    }

    openNoteMenuAt(event.clientX, event.clientY, targetIds)
  }

  const handleCreateNote = async () => {
    if (!repo || !deviceId || creatingNote) {
      return
    }
    setCreatingNote(true)
    try {
      const seed =
        !offline && remote.mode === "http"
          ? await remote.client.fetchNewDraftSeed?.().catch(() => null)
          : null
      const draft = seed?.structuredDraft ?? createNewStructuredNoteDraft(new Date(), [])
      const prototype = continuumBootstrapPrototype(draft)
      const saved = await repo.saveNote({
        bumpLocalVersion: true,
        deviceId,
        structuredDraft: draft,
        slug: draft.id,
        syncState: offline ? "offline" : "dirty",
        tiptapJson: prototype.tiptap,
      })
      const nextNotes = await repo.listNotesMeta({ folder: "all" })
      setFolder("all")
      setNotes(nextNotes)
      setSidebarSelectionFocus(false)
      setNewlyCreatedNoteId(saved.id)
      setSelectedId(saved.id)
      setSelectedNoteIds([saved.id])
      setSelectionAnchorId(saved.id)
      setFullNote(saved)
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

  const handlePublishToggle = async () => {
    if (!repo || !selectedId || !fullNote || syncBusy || offline) {
      return
    }
    const action = isPublished ? remote.client.unpublishNote : remote.client.publishNote
    if (!action) {
      setSyncLabel("Publicacion no disponible")
      return
    }

    setSyncBusy(true)
    setSyncLabel(isPublished ? "Volviendo a borrador..." : "Publicando...")
    try {
      await flushPendingAutosave()
      const syncResult = await engineRef.current?.syncNote(selectedId)
      if (syncResult?.status === "conflict") {
        setSyncLabel("Conflicto remoto")
        return
      }
      if (syncResult?.status === "error") {
        setSyncLabel("Pendiente de reintento")
        return
      }
      if (syncResult?.status === "offline") {
        setSyncLabel("Sin conexion")
        return
      }

      const lifecycle = await action.call(remote.client, selectedId)
      if (!lifecycle.persisted) {
        setSyncLabel("Diario no persistio el cambio")
        return
      }

      const remoteMeta = await remote.client.fetchRemoteMeta(selectedId)
      await repo.applyRemoteSynced({
        noteId: selectedId,
        remoteVersion: remoteMeta?.remoteVersion ?? fullNote.remoteVersion,
        status: lifecycle.status ?? (isPublished ? "draft" : "published"),
      })
      const next = await repo.getNoteById(selectedId)
      setFullNote(next)
      await refreshList()
      await refreshSyncStatus()
      setSyncLabel(isPublished ? "Borrador online" : "Publicado online")
    } catch {
      setSyncLabel(isPublished ? "Error al despublicar" : "Error al publicar")
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
        setSelectedNoteIds([duplicate.id])
        setSelectionAnchorId(duplicate.id)
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

  const moveNotesToTrash = async (noteIds: string[]) => {
    if (!repo || folder !== "all") {
      return
    }
    const uniqueNoteIds = [...new Set(noteIds)]
    if (uniqueNoteIds.length === 0) {
      return
    }
    flushAutosaveTimer()
    for (const noteId of uniqueNoteIds) {
      await repo.moveToTrash(noteId)
    }
    const nextNotes = await repo.listNotesMeta({ folder: "all" })
    const nextSelectedId = nextNotes[0]?.id ?? null
    setNotes(nextNotes)
    setSelectedId(nextSelectedId)
    setSelectedNoteIds(nextSelectedId ? [nextSelectedId] : [])
    setSelectionAnchorId(nextSelectedId)
    const nextFullNote = nextSelectedId ? await repo.getNoteById(nextSelectedId) : null
    setFullNote(nextFullNote)
    if (!nextFullNote) {
      setLivePayload(null)
      livePayloadRef.current = null
      editorRef.current = null
      setEditor(null)
      closeEditorMenu()
    }
    closeNoteMenu()
    await refreshSyncStatus()
  }

  const handleTrash = async () => {
    const noteIds =
      selectedVisibleNoteIds.length > 0
        ? selectedVisibleNoteIds
        : selectedId
          ? [selectedId]
          : []
    await moveNotesToTrash(noteIds)
  }

  const handleTrashFromNoteMenu = async () => {
    await moveNotesToTrash(noteMenu.noteIds)
  }

  const handleRestore = async () => {
    if (!repo || !selectedId || folder !== "trash") {
      return
    }
    await repo.restoreFromTrash(selectedId)
    setFolder("all")
    const nextNotes = await repo.listNotesMeta({ folder: "all" })
    setNotes(nextNotes)
    setSelectedNoteIds([selectedId])
    setSelectionAnchorId(selectedId)
    await refreshSyncStatus()
  }

  const handleAddReference = async (
    input: ContinuumEditorMenuReferenceInput = {
      author: "",
      authorBirthYear: "",
      authorDeathYear: "",
      body: "Nueva referencia",
      comment: "",
      edition: "",
      sourceText: "",
      translator: "",
      work: "",
      workDate: "",
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
    const authorBirthYear = parseOptionalIntegerInput(input.authorBirthYear)
    const authorDeathYear = parseOptionalIntegerInput(input.authorDeathYear)
    const comment = textDocumentFromTextarea(input.comment, `${refId}-comment`)
    const sourceText = textDocumentFromTextarea(input.sourceText, `${refId}-source`)
    const nextDraft = normalizeStructuredNoteDraft({
      ...sourceDraft,
      references: [
        ...sourceDraft.references,
        {
          ...(input.author.trim() ? { author: input.author.trim() } : {}),
          ...(authorBirthYear !== undefined ? { authorBirthYear } : {}),
          ...(authorDeathYear !== undefined ? { authorDeathYear } : {}),
          body,
          ...(comment ? { comment } : {}),
          ...(input.edition.trim() ? { edition: input.edition.trim() } : {}),
          ...(sourceText ? { sourceText } : {}),
          ...(input.translator.trim() ? { translator: input.translator.trim() } : {}),
          ...(input.work.trim() ? { work: input.work.trim() } : {}),
          ...(input.workDate.trim() ? { workDate: input.workDate.trim() } : {}),
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
      <div className="continuum-shell" data-theme={appearanceMode}>
        <p className="continuum-error">{bootstrapError}</p>
        <p className="continuum-help">
          Ejecutá la app con <code>pnpm tauri:dev</code> para habilitar SQLite embebido.
        </p>
      </div>
    )
  }

  if (!repo || !authLoaded) {
    return (
      <div className="continuum-shell continuum-loading" data-theme={appearanceMode}>
        <p>Cargando biblioteca…</p>
      </div>
    )
  }

  if (!authSession) {
    return (
      <div className="continuum-shell continuum-auth-shell" data-theme={appearanceMode}>
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
      <div className="continuum-shell" data-theme={appearanceMode}>
        {sidebarVisible ? (
          <>
          <aside className="continuum-sidebar" style={{ width: sidebarWidth }}>
            <header className="continuum-brand">
              <BrandMark />
              <div className="continuum-brand-actions">
                <button
                  type="button"
                  className="continuum-icon-button"
                  disabled={creatingNote}
                  onClick={handleCreateNote}
                  aria-label="Nueva nota"
                  title="Nueva nota"
                >
                  <NewNoteIcon />
                </button>
                <button
                  type="button"
                  className="continuum-icon-button"
                  onClick={handleToggleSidebar}
                  aria-label="Ocultar panel"
                  title="Ocultar panel"
                >
                  ⟨
                </button>
              </div>
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
                aria-label="Papelera"
                title="Papelera"
              >
                <TrashIcon />
              </button>
            </nav>
            <div className="continuum-list" />
          </aside>
          <div
            className="continuum-sidebar-resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="Cambiar ancho de la lista"
            onMouseDown={handleSidebarResizeMouseDown}
          />
          </>
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
      <div className="continuum-shell continuum-loading" data-theme={appearanceMode}>
        <p>Cargando nota…</p>
      </div>
    )
  }

  const prototype = continuumBootstrapPrototype(fullNote.structuredDraft)
  const selectedConflict = conflicts.find((conflict) => conflict.noteId === selectedId)
  const selectedConflictRemoteDraft = getConflictRemoteDraft(selectedConflict)
  const localConflictPreview = selectedConflict
    ? getConflictPreview(fullNote.structuredDraft, fullNote.remoteVersion)
    : null
  const remoteConflictPreview = selectedConflictRemoteDraft
    ? getConflictPreview(
        selectedConflictRemoteDraft.structuredDraft,
        selectedConflictRemoteDraft.remoteVersion,
      )
    : null
  const retryTime = formatRetryTime(syncStatus?.nextRetryAt ?? null)

  return (
    <div className="continuum-shell" data-theme={appearanceMode}>
      {sidebarVisible ? (
        <>
        <aside className="continuum-sidebar" style={{ width: sidebarWidth }}>
          <header className="continuum-brand">
            <BrandMark />
            <div className="continuum-brand-actions">
              <button
                type="button"
                className="continuum-icon-button"
                disabled={creatingNote}
                onClick={handleCreateNote}
                aria-label="Nueva nota"
                title="Nueva nota"
              >
                <NewNoteIcon />
              </button>
              <button
                type="button"
                className="continuum-icon-button"
                onClick={handleToggleSidebar}
                aria-label="Ocultar panel"
                title="Ocultar panel"
              >
                ⟨
              </button>
            </div>
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
              aria-label="Papelera"
              title="Papelera"
            >
              <TrashIcon />
            </button>
          </nav>
          {folder === "all" && selectedVisibleNoteIds.length > 1 ? (
            <div className="continuum-bulk-actions">
              <span>{selectedVisibleNoteIds.length} seleccionadas</span>
              <button type="button" onClick={handleTrash}>
                Papelera
              </button>
            </div>
          ) : null}
          <div className="continuum-list">
            {notes.map((note) => {
              const titleText = note.title.trim()
              const previewText = getNotePreviewText(note) || "Nota vacía"
              const isActive = note.id === selectedId
              const hasListFocus = sidebarSelectionFocus && isActive

              return (
                <button
                  key={note.id}
                  type="button"
                  className={[
                    "continuum-list-row",
                    isActive ? "active" : "",
                    hasListFocus ? "list-focused" : "",
                    selectedNoteIdSet.has(note.id) ? "selected" : "",
                    newlyCreatedNoteId === note.id ? "newly-created" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-pressed={selectedNoteIdSet.has(note.id)}
                  onClick={(event) => handleSelectNoteFromList(event, note.id)}
                  onContextMenu={(event) => handleNoteContextMenu(event, note.id)}
                >
                  <time className="continuum-list-date" dateTime={note.writtenAt}>
                    {formatDiaryDate(note.writtenAt)}
                  </time>
                  {titleText ? (
                    <div className="continuum-list-title">{titleText}</div>
                  ) : null}
                  <div className="continuum-list-preview">{previewText}</div>
                  <div
                    className={`continuum-list-sync continuum-list-sync--${note.syncState}`}
                  >
                    {syncStateLabel(note.syncState)}
                  </div>
                </button>
              )
            })}
          </div>
        </aside>
        <div
          className="continuum-sidebar-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Cambiar ancho de la lista"
          onMouseDown={handleSidebarResizeMouseDown}
        />
        </>
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

      {noteMenu.isOpen ? (
        <>
          <div
            className="continuum-note-menu-backdrop"
            onMouseDown={closeNoteMenu}
            onContextMenu={(event) => {
              event.preventDefault()
              closeNoteMenu()
            }}
          />
          <div
            className="continuum-note-context-menu"
            style={{ left: noteMenu.x, top: noteMenu.y }}
            onContextMenu={(event) => event.preventDefault()}
          >
            <button type="button" onClick={handleTrashFromNoteMenu}>
              <span className="continuum-note-context-menu-icon">
                <TrashIcon />
              </span>
              <span>Enviar a papelera</span>
            </button>
          </div>
        </>
      ) : null}

      <main className="continuum-main" ref={mainRef}>
        <ContinuumEditorMenu
          activeCitation={activeCitation}
          activeReferenceInsert={activeReferenceInsert}
          appearanceMode={appearanceMode}
          canCreateCitation={canCreateCitation}
          canCreateInlineMath={canCreateInlineMath}
          canCreateReferenceInsert={canCreateReferenceInsert}
          canModifyAphorism={canModifyAphorism}
          canPublish={canPublish}
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
          onPublishToggle={handlePublishToggle}
          onReferenceSearchChange={setReferenceSearch}
          onRemoveCitation={() => removeCitationFromSelection(editorRef.current)}
          onRestore={handleRestore}
          onRetrySync={handleRetrySyncNow}
          onSetAppearanceMode={handleSetAppearanceMode}
          onSetOffline={setOffline}
          onTrash={handleTrash}
          onMarkAllParagraphsAsAphorisms={() =>
            markAllParagraphsAsAphorisms(editorRef.current)
          }
          onJoinPreviousAphorism={() =>
            joinCurrentBlockToPreviousAphorism(editorRef.current)
          }
          onSeparateAphorism={() =>
            separateAphorismFromCurrentBlock(editorRef.current, setSyncLabel)
          }
          onToggleAphorism={() => markCurrentBlockAsAphorism(editorRef.current)}
          onUnmarkAphorism={() =>
            unmarkCurrentBlockAsAphorism(editorRef.current, setSyncLabel)
          }
          onTitleChange={setTitle}
          onWrittenAtChange={setWrittenAt}
          publishLabel={isPublished ? "Volver a borrador" : "Publicar"}
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
            <div className="continuum-conflict-body">
              <strong>Conflicto remoto</strong>
              <p>
                Esta nota cambió online antes de subir tu versión local. Podés
                conservar tu copia, usar la versión online o duplicar tu copia local.
              </p>
              <div className="continuum-conflict-preview-grid">
                {localConflictPreview ? (
                  <article>
                    <span>Local · rev {localConflictPreview.version}</span>
                    <b>{localConflictPreview.title}</b>
                    <small>{localConflictPreview.writtenAt}</small>
                    <p>{localConflictPreview.excerpt}</p>
                  </article>
                ) : null}
                <article>
                  <span>
                    Remoto
                    {remoteConflictPreview ? ` · rev ${remoteConflictPreview.version}` : ""}
                  </span>
                  {remoteConflictPreview ? (
                    <>
                      <b>{remoteConflictPreview.title}</b>
                      <small>{remoteConflictPreview.writtenAt}</small>
                      <p>{remoteConflictPreview.excerpt}</p>
                    </>
                  ) : (
                    <p>El cuerpo remoto se va a pedir a Diario al resolver.</p>
                  )}
                </article>
              </div>
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
          onEditorContextMenu={handleEditorContextMenu}
          onEditorFocus={() => setSidebarSelectionFocus(false)}
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
