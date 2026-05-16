import type { Editor } from "@tiptap/core"
import {
  createNewStructuredNoteDraft,
  normalizeStructuredNoteDraft,
} from "@continuum/core"
import { emergencyIsNewer } from "@continuum/storage"
import {
  ContinuumEditor,
  addCitationToSelection,
  associateReferenceWithActiveCitation,
  continuumBootstrapPrototype,
  convertMarkdownInlineMath,
  convertSelectionToReferenceInsert,
  makeId,
  markCurrentBlockAsAphorism,
  removeCitationFromSelection,
  type ContinuumEditorPayload,
} from "@continuum/editor"
import type { NoteFull, NoteMeta } from "@continuum/storage/types"
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
  const [offline, setOffline] = useState(false)

  const editorRef = useRef<Editor | null>(null)
  const debounceRef = useRef<number | undefined>(undefined)
  const offlineRef = useRef(false)
  offlineRef.current = offline

  const selectedRef = useRef<string | null>(null)
  selectedRef.current = selectedId

  const remote = useMemo(() => createContinuumSyncClient(authSession), [authSession])
  const engineRef = useRef<DraftSyncEngine | null>(null)

  const refreshList = useCallback(async () => {
    if (!repo) {
      return
    }
    const rows = await repo.listNotesMeta({
      folder: folder === "trash" ? "trash" : "all",
    })
    setNotes(rows)
  }, [repo, folder])

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
  }, [repo, folder, refreshList])

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
          await refreshList()
          if (noteId === selectedRef.current) {
            const next = await repo.getNoteById(noteId)
            setFullNote(next)
          }
        },
        markState: (noteId, state) => repo.markSyncState(noteId, state as never),
        onConflict: async (noteId) => {
          const local = await repo.getNoteById(noteId)
          await repo.recordConflict(noteId, local, { remoteAhead: true })
          setSyncLabel("Conflicto remoto")
        },
        onError: async () => {
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
  }, [authSession, remote, repo, refreshList])

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
        await engineRef.current?.syncNote(selectedId)
        await clearEmergencyDraft()
        setSyncLabel(
          offline
            ? "Sin conexión"
            : remote.mode === "http"
              ? "Sincronizado online"
              : "Sincronizado (mock)",
        )
      } else {
        setSyncLabel(offline ? "Sin conexión" : "Guardado")
        await clearEmergencyDraft()
      }
      const shouldSnapshot = options.manual || saved.localVersion % 2 === 0
      if (shouldSnapshot) {
        await repo.appendRevision(selectedId)
      }
      await refreshList()
      if (selectedRef.current === selectedId) {
        setFullNote(saved)
      }
    },
    [deviceId, offline, refreshList, repo, selectedId],
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

  const handleTrash = async () => {
    if (!repo || !selectedId || folder !== "all") {
      return
    }
    flushAutosaveTimer()
    await repo.moveToTrash(selectedId)
    setSelectedId(null)
    await refreshList()
  }

  const handleRestore = async () => {
    if (!repo || !selectedId || folder !== "trash") {
      return
    }
    await repo.restoreFromTrash(selectedId)
    setFolder("all")
    await refreshList()
  }

  const handleAddReference = async () => {
    if (!repo || !fullNote || !deviceId) {
      return
    }
    const refId = makeId("reference")
    const nextDraft = normalizeStructuredNoteDraft({
      ...fullNote.structuredDraft,
      references: [
        ...fullNote.structuredDraft.references,
        {
          body: "Nueva referencia",
          id: refId,
        },
      ],
    })
    await repo.saveNote({
      bumpLocalVersion: true,
      deviceId,
      structuredDraft: nextDraft,
      syncState: offline ? "offline" : "dirty",
      tiptapJson: fullNote.tiptapJson,
    })
    const refreshed = await repo.getNoteById(fullNote.id)
    setFullNote(refreshed)
    await refreshList()
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

      <main className="continuum-main">
        <header className="continuum-toolbar">
          <div className="continuum-toolbar-tools">
            <button
              type="button"
              onClick={() => markCurrentBlockAsAphorism(editorRef.current)}
            >
              Aforismo
            </button>
            <button type="button" onClick={() => addCitationToSelection(editorRef.current)}>
              Cita
            </button>
            <button
              type="button"
              onClick={() => removeCitationFromSelection(editorRef.current)}
            >
              Quitar cita
            </button>
            <label className="continuum-toolbar-select">
              Asociar cita
              <select
                defaultValue=""
                onChange={(event) => {
                  const referenceId = event.target.value
                  if (!referenceId) {
                    return
                  }
                  associateReferenceWithActiveCitation(editorRef.current, referenceId)
                  event.target.selectedIndex = 0
                }}
              >
                <option value="">Referencia…</option>
                {(livePayload ?? fullNote).structuredDraft.references.map((reference) => (
                  <option key={reference.id} value={reference.id}>
                    {reference.author || reference.work || reference.body || reference.id}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => convertSelectionToReferenceInsert(editorRef.current)}
            >
              Insertar cita larga
            </button>
            <button
              type="button"
              onClick={() => convertMarkdownInlineMath(editorRef.current)}
            >
              TeX ($…$)
            </button>
            <button type="button" onClick={handleAddReference}>
              + Referencia
            </button>
            {folder === "all" ? (
              <button type="button" onClick={handleTrash}>
                Mover a papelera
              </button>
            ) : (
              <button type="button" onClick={handleRestore}>
                Restaurar
              </button>
            )}
          </div>
          <div className="continuum-toolbar-status">
            <label className="continuum-offline">
              <input
                type="checkbox"
                checked={offline}
                onChange={(event) => setOffline(event.target.checked)}
              />
              Modo offline
            </label>
            <button type="button" onClick={handleManualSave}>
              Guardar borrador
            </button>
            <span className="continuum-sync-pill" title={syncLabel}>
              {syncLabel}
            </span>
            <span className="continuum-sync-source" title={`Sync: ${remote.label}`}>
              {remote.mode === "http" ? "Diario" : "Mock"}
            </span>
            <button type="button" className="continuum-logout" onClick={handleLogout}>
              Salir
            </button>
          </div>
        </header>

        <ContinuumEditor
          initialDraft={fullNote.structuredDraft}
          initialPrototype={prototype}
          noteId={fullNote.id}
          onPayload={handleEditorPayload}
          onReady={(editor) => {
            editorRef.current = editor
          }}
          onTitleChange={setTitle}
          onWrittenAtChange={setWrittenAt}
          title={title}
          writtenAt={writtenAt}
        />
      </main>
    </div>
  )
}
