import type {
  ActiveCitationDetails,
  ActiveReferenceInsertDetails,
} from "@continuum/editor"
import { formatReferenceLabel } from "@continuum/editor"
import type { StructuredNoteDraftReference } from "@continuum/core"
import type { LexicalLookupResult } from "@continuum/lexical"
import type {
  CSSProperties,
  FormEvent,
  ReactNode,
} from "react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

const VIEWPORT_MARGIN = 28
type MenuSectionId = "text" | "references" | "note" | "sync" | "application"

function clampMenuPosition(x: number, y: number, width: number, height: number) {
  const menuWidth = Math.min(width, window.innerWidth - VIEWPORT_MARGIN * 2)
  const menuHeight = Math.min(height, window.innerHeight - VIEWPORT_MARGIN * 2)

  return {
    x: Math.max(VIEWPORT_MARGIN, Math.min(x, window.innerWidth - menuWidth - VIEWPORT_MARGIN)),
    y: Math.max(VIEWPORT_MARGIN, Math.min(y, window.innerHeight - menuHeight - VIEWPORT_MARGIN)),
  }
}

export type ContinuumEditorMenuReferenceInput = {
  author: string
  authorBirthYear: string
  authorDeathYear: string
  body: string
  comment: string
  edition: string
  sourceText: string
  translator: string
  work: string
  workDate: string
}

export type ContinuumEditorMenuLexicalLookup =
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

type ContinuumEditorMenuProps = {
  activeCitation: ActiveCitationDetails | null
  activeReferenceInsert: ActiveReferenceInsertDetails | null
  appearanceMode: "dark" | "light"
  canCreateCitation: boolean
  canCreateInlineMath: boolean
  canCreateReferenceInsert: boolean
  canModifyAphorism: boolean
  canPublish: boolean
  canRetrySync: boolean
  creatingReference?: boolean
  filteredReferences: readonly StructuredNoteDraftReference[]
  referenceLibrary: readonly StructuredNoteDraftReference[]
  folder: "all" | "trash"
  isOpen: boolean
  lexicalLookup: ContinuumEditorMenuLexicalLookup | null
  offline: boolean
  onAddCitation: () => void
  onAddReference: (
    input: ContinuumEditorMenuReferenceInput,
    mode: "library" | "active-target",
  ) => void
  onAssociateCitationReference: (referenceId: string) => void
  onAssociateReferenceInsertReference: (referenceId: string) => void
  onClearCitationReference: () => void
  onClearReferenceInsertReference: () => void
  onClose: () => void
  onConvertInlineMath: () => void
  onCreateReferenceInsert: () => void
  onLogout: () => void
  onSetAppearanceMode: (value: "dark" | "light") => void
  onJoinPreviousAphorism: () => void
  onManualSave: () => void
  onMarkAllParagraphsAsAphorisms: () => void
  onPublishToggle: () => void
  onReferenceSearchChange: (value: string) => void
  onRemoveCitation: () => void
  onReplaceSelectedWord: (word: string) => void
  onRestore: () => void
  onRetrySync: () => void
  onSetOffline: (value: boolean) => void
  onSeparateAphorism: () => void
  onTrash: () => void
  onToggleAphorism: () => void
  onUnmarkAphorism: () => void
  onTitleChange: (value: string) => void
  onWrittenAtChange: (value: string) => void
  publishLabel: string
  referenceSearch: string
  remoteLabel: string
  remoteMode: "http" | "mock"
  retryTime: string | null
  selectedReferenceId: string
  selectedReferenceInsertId: string
  syncBusy: boolean
  syncConflictCount: number
  syncLabel: string
  syncPendingCount: number
  title: string
  writtenAt: string
  width: number
  x: number
  y: number
}

export function ContinuumEditorMenu({
  activeCitation,
  activeReferenceInsert,
  appearanceMode,
  canCreateCitation,
  canCreateInlineMath,
  canCreateReferenceInsert,
  canModifyAphorism,
  canPublish,
  canRetrySync,
  creatingReference = false,
  filteredReferences,
  referenceLibrary,
  folder,
  isOpen,
  lexicalLookup,
  offline,
  onAddCitation,
  onAddReference,
  onAssociateCitationReference,
  onAssociateReferenceInsertReference,
  onClearCitationReference,
  onClearReferenceInsertReference,
  onClose,
  onConvertInlineMath,
  onCreateReferenceInsert,
  onLogout,
  onSetAppearanceMode,
  onJoinPreviousAphorism,
  onManualSave,
  onMarkAllParagraphsAsAphorisms,
  onPublishToggle,
  onReferenceSearchChange,
  onRemoveCitation,
  onReplaceSelectedWord,
  onRestore,
  onRetrySync,
  onSetOffline,
  onSeparateAphorism,
  onTrash,
  onToggleAphorism,
  onUnmarkAphorism,
  onTitleChange,
  onWrittenAtChange,
  publishLabel,
  referenceSearch,
  remoteLabel,
  remoteMode,
  retryTime,
  selectedReferenceId,
  selectedReferenceInsertId,
  syncBusy,
  syncConflictCount,
  syncLabel,
  syncPendingCount,
  title,
  writtenAt,
  width,
  x,
  y,
}: ContinuumEditorMenuProps) {
  const [referenceInput, setReferenceInput] =
    useState<ContinuumEditorMenuReferenceInput>({
      author: "",
      authorBirthYear: "",
      authorDeathYear: "",
      body: "",
      comment: "",
      edition: "",
      sourceText: "",
      translator: "",
      work: "",
      workDate: "",
    })
  const hasActiveReferenceTarget = Boolean(activeCitation || activeReferenceInsert)
  const [menuPosition, setMenuPosition] = useState({ x, y })
  const [openSection, setOpenSection] = useState<MenuSectionId | null>(
    hasActiveReferenceTarget ? "references" : "text",
  )
  const menuRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (isOpen) {
      setMenuPosition({ x, y })
      setOpenSection(hasActiveReferenceTarget ? "references" : "text")
    }
  }, [hasActiveReferenceTarget, isOpen, x, y])

  useLayoutEffect(() => {
    if (!isOpen || !menuRef.current) {
      return
    }

    const { offsetHeight } = menuRef.current
    setMenuPosition((current) =>
      clampMenuPosition(current.x, current.y, width, offsetHeight),
    )
  }, [isOpen, width, x, y])

  if (!isOpen) {
    return null
  }

  const style = {
    left: menuPosition.x,
    top: menuPosition.y,
    width,
  } satisfies CSSProperties

  const submitReference = (
    event: FormEvent<HTMLFormElement>,
    mode: "library" | "active-target",
  ) => {
    event.preventDefault()
    onAddReference(referenceInput, mode)
    setReferenceInput({
      author: "",
      authorBirthYear: "",
      authorDeathYear: "",
      body: "",
      comment: "",
      edition: "",
      sourceText: "",
      translator: "",
      work: "",
      workDate: "",
    })
  }

  return (
    <div className="continuum-menu-backdrop" onMouseDown={onClose}>
      <aside
        ref={menuRef}
        aria-label="Menu de editor"
        className="continuum-editor-menu"
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onClose()
          }
        }}
        onMouseDown={(event) => event.stopPropagation()}
        style={style}
      >
        <div className="continuum-menu-header">
          <span>Editor</span>
          <button type="button" onClick={onClose} aria-label="Cerrar menu">
            Esc
          </button>
        </div>

        {lexicalLookup ? (
          <LexicalLookupPanel
            lookup={lexicalLookup}
            onReplaceSelectedWord={onReplaceSelectedWord}
          />
        ) : null}

        <MenuSection
          icon="T"
          isOpen={openSection === "text"}
          onToggle={() => setOpenSection((current) => (current === "text" ? null : "text"))}
          title="Texto"
        >
          <div className="continuum-menu-list">
            <MenuButton icon="A" onClick={onToggleAphorism}>
              Aforismo
            </MenuButton>
            <MenuButton icon="A*" onClick={onMarkAllParagraphsAsAphorisms}>
              Marcar todos como aforismos
            </MenuButton>
            <MenuButton
              disabled={!canModifyAphorism}
              icon="A-"
              onClick={onUnmarkAphorism}
              title={
                canModifyAphorism
                  ? undefined
                  : "Pon el cursor sobre un aforismo para quitarlo."
              }
            >
              Quitar aforismo
            </MenuButton>
            <MenuButton icon="A↑" onClick={onJoinPreviousAphorism}>
              Unir al anterior
            </MenuButton>
            <MenuButton
              disabled={!canModifyAphorism}
              icon="A↓"
              onClick={onSeparateAphorism}
              title={
                canModifyAphorism
                  ? undefined
                  : "Pon el cursor sobre un aforismo para separarlo."
              }
            >
              Separar desde parrafo
            </MenuButton>
            <MenuButton
              disabled={!canCreateCitation}
              icon="i¹"
              onClick={onAddCitation}
              title={
                canCreateCitation
                  ? undefined
                  : "Selecciona texto para agregar superindice."
              }
            >
              Superindice
            </MenuButton>
            <MenuButton
              disabled={!activeCitation}
              icon="i-"
              onClick={onRemoveCitation}
              title={
                activeCitation
                  ? undefined
                  : "Pon el cursor sobre un superindice para quitarlo."
              }
            >
              Quitar superindice
            </MenuButton>
            <MenuButton
              disabled={!canCreateReferenceInsert}
              icon="''"
              onClick={onCreateReferenceInsert}
              title={
                canCreateReferenceInsert
                  ? undefined
                  : "Selecciona texto para insertar una cita larga."
              }
            >
              Cita larga
            </MenuButton>
            <MenuButton
              disabled={!canCreateInlineMath}
              icon="$"
              onClick={onConvertInlineMath}
              title={
                canCreateInlineMath ? undefined : "Selecciona texto TeX entre $...$."
              }
            >
              TeX ($...$)
            </MenuButton>
          </div>
        </MenuSection>

        <MenuSection
          icon="R"
          isOpen={openSection === "references"}
          onToggle={() =>
            setOpenSection((current) =>
              current === "references" ? null : "references",
            )
          }
          title="Referencias"
        >
          {activeCitation ? (
            <ReferenceResolver
              label={`Superindice ${activeCitation.visibleNumber}`}
              body={activeCitation.selectedText}
              reference={activeCitation.reference}
              filteredReferences={filteredReferences}
              onClear={onClearCitationReference}
              onReferenceSearchChange={onReferenceSearchChange}
              onSelect={onAssociateCitationReference}
              referenceSearch={referenceSearch}
              selectedReferenceId={selectedReferenceId}
            />
          ) : null}
          {activeReferenceInsert ? (
            <ReferenceResolver
              label="Cita larga"
              body={activeReferenceInsert.text}
              reference={activeReferenceInsert.reference}
              filteredReferences={filteredReferences}
              onClear={onClearReferenceInsertReference}
              onReferenceSearchChange={onReferenceSearchChange}
              onSelect={onAssociateReferenceInsertReference}
              referenceSearch={referenceSearch}
              selectedReferenceId={selectedReferenceInsertId}
            />
          ) : null}
          {!hasActiveReferenceTarget ? (
            <p className="continuum-menu-note">
              Selecciona un superindice o una cita larga para asociar una referencia.
            </p>
          ) : null}
          <ReferenceCreateForm
            creatingReference={creatingReference}
            input={referenceInput}
            mode={hasActiveReferenceTarget ? "active-target" : "library"}
            onChange={setReferenceInput}
            onSubmit={submitReference}
            referenceLibrary={referenceLibrary}
          />
        </MenuSection>

        <MenuSection
          icon="N"
          isOpen={openSection === "note"}
          onToggle={() => setOpenSection((current) => (current === "note" ? null : "note"))}
          title="Nota"
        >
          <label className="continuum-menu-field">
            <span>Fecha escrita</span>
            <input
              type="date"
              value={(writtenAt || "").slice(0, 10)}
              onChange={(event) => onWrittenAtChange(event.target.value)}
            />
          </label>
          <label className="continuum-menu-field">
            <span>Titulo</span>
            <input
              type="text"
              value={title}
              placeholder="Sin titulo"
              onChange={(event) => onTitleChange(event.target.value)}
            />
          </label>
          <div className="continuum-menu-list">
            <MenuButton icon="S" onClick={onManualSave}>
              Guardar borrador
            </MenuButton>
            <MenuButton
              disabled={!canPublish}
              icon="↑"
              onClick={onPublishToggle}
              title={canPublish ? undefined : "Sincroniza online antes de publicar."}
            >
              {publishLabel}
            </MenuButton>
            {folder === "all" ? (
              <MenuButton icon="X" onClick={onTrash}>
                Mover a papelera
              </MenuButton>
            ) : (
              <MenuButton icon="↩" onClick={onRestore}>
                Restaurar
              </MenuButton>
            )}
          </div>
        </MenuSection>

        <MenuSection
          icon="↻"
          isOpen={openSection === "sync"}
          onToggle={() => setOpenSection((current) => (current === "sync" ? null : "sync"))}
          title="Sincronizacion"
        >
          <div className="continuum-menu-status">
            <span>{syncLabel}</span>
            <small>
              {syncConflictCount
                ? `${syncConflictCount} conflicto`
                : syncPendingCount
                  ? `${syncPendingCount} pendiente`
                  : "0 pendiente"}
              {retryTime ? ` · ${retryTime}` : ""}
            </small>
            <small title={`Sync: ${remoteLabel}`}>
              {remoteMode === "http" ? "Diario" : "Mock"}
            </small>
          </div>
          <label className="continuum-menu-check">
            <input
              type="checkbox"
              checked={offline}
              onChange={(event) => onSetOffline(event.currentTarget.checked)}
            />
            <span>Modo offline</span>
          </label>
          <MenuButton
            disabled={syncBusy || !canRetrySync}
            icon="!"
            onClick={onRetrySync}
          >
            Reintentar
          </MenuButton>
        </MenuSection>

        <MenuSection
          icon="C"
          isOpen={openSection === "application"}
          onToggle={() =>
            setOpenSection((current) =>
              current === "application" ? null : "application",
            )
          }
          title="Aplicacion"
        >
          <MenuButton
            icon={appearanceMode === "dark" ? "☼" : "☾"}
            onClick={() => onSetAppearanceMode(appearanceMode === "dark" ? "light" : "dark")}
          >
            {appearanceMode === "dark" ? "Modo claro" : "Modo oscuro"}
          </MenuButton>
          <MenuButton icon="←" onClick={onLogout}>
            Salir
          </MenuButton>
        </MenuSection>
      </aside>
    </div>
  )
}

function MenuSection({
  children,
  icon,
  isOpen,
  onToggle,
  title,
}: {
  children: ReactNode
  icon: string
  isOpen: boolean
  onToggle: () => void
  title: string
}) {
  return (
    <details className="continuum-menu-section" open={isOpen}>
      <summary
        onClick={(event) => {
          event.preventDefault()
          onToggle()
        }}
        onMouseDown={(event) => event.preventDefault()}
      >
        <span className="continuum-menu-icon" aria-hidden="true">
          {icon}
        </span>
        <span>{title}</span>
        <span className="continuum-menu-chevron" aria-hidden="true">
          ›
        </span>
      </summary>
      <div className="continuum-menu-section-body">{children}</div>
    </details>
  )
}

function LexicalLookupPanel({
  lookup,
  onReplaceSelectedWord,
}: {
  lookup: ContinuumEditorMenuLexicalLookup
  onReplaceSelectedWord: (word: string) => void
}) {
  return (
    <section className="continuum-lexical-panel" aria-label="Consulta lexical">
      <div className="continuum-lexical-header">
        <span>Palabra</span>
        <strong>{lookup.term}</strong>
      </div>
      {lookup.status === "loading" ? (
        <p className="continuum-lexical-message">Buscando en RAE...</p>
      ) : null}
      {lookup.status === "error" ? (
        <p className="continuum-lexical-message continuum-lexical-message-error">
          {lookup.message}
        </p>
      ) : null}
      {lookup.status === "ready" ? (
        <>
          <LexicalWordList
            emptyLabel="Sin sinonimos registrados"
            label="Sinonimos"
            onSelect={onReplaceSelectedWord}
            words={lookup.result.synonyms}
          />
          <LexicalWordList
            emptyLabel="Sin antonimos registrados"
            label="Antonimos"
            onSelect={onReplaceSelectedWord}
            words={lookup.result.antonyms}
          />
          <div className="continuum-lexical-etymology">
            <span>Etimologia</span>
            <p>{lookup.result.etymology ?? "Sin etimologia registrada"}</p>
          </div>
          <LexicalDefinitions definitions={lookup.result.definitions} />
          <LexicalRawSenses rawSenses={lookup.result.rawSenses} />
          <LexicalLocutions
            locutions={lookup.result.locutions}
            onReplaceSelectedWord={onReplaceSelectedWord}
          />
          <LexicalSuggestions suggestions={lookup.result.suggestions} />
          <div className="continuum-lexical-source">
            Fuente: {lookup.result.source.label}
          </div>
        </>
      ) : null}
    </section>
  )
}

function LexicalDefinitions({
  definitions,
}: {
  definitions: LexicalLookupResult["definitions"]
}) {
  if (!definitions.length) {
    return (
      <div className="continuum-lexical-group">
        <span>Acepciones</span>
        <p>Sin acepciones registradas</p>
      </div>
    )
  }

  return (
    <div className="continuum-lexical-group">
      <span>Acepciones</span>
      <ol className="continuum-lexical-definitions">
        {definitions.slice(0, 5).map((definition, index) => (
          <li key={`${definition.description}-${index}`}>
            {definition.description}
            {definition.category ? <small>{definition.category}</small> : null}
          </li>
        ))}
      </ol>
    </div>
  )
}

function LexicalRawSenses({
  rawSenses,
}: {
  rawSenses: readonly string[]
}) {
  if (!rawSenses.length) {
    return null
  }

  return (
    <details className="continuum-lexical-details">
      <summary>Entrada completa</summary>
      <div className="continuum-lexical-raw-list">
        {rawSenses.slice(0, 4).map((sense) => (
          <p key={sense}>{sense}</p>
        ))}
      </div>
    </details>
  )
}

function LexicalLocutions({
  locutions,
  onReplaceSelectedWord,
}: {
  locutions: LexicalLookupResult["locutions"]
  onReplaceSelectedWord: (word: string) => void
}) {
  if (!locutions.length) {
    return null
  }

  return (
    <details className="continuum-lexical-details">
      <summary>Locuciones</summary>
      <div className="continuum-lexical-locutions">
        {locutions.slice(0, 4).map((locution) => (
          <div key={locution.expression} className="continuum-lexical-locution">
            <strong>{locution.expression}</strong>
            {locution.definitions[0] ? <p>{locution.definitions[0].description}</p> : null}
            {locution.synonyms.length ? (
              <LexicalWordList
                emptyLabel=""
                label="Sinonimos"
                onSelect={onReplaceSelectedWord}
                words={locution.synonyms.map((item) => item.word)}
              />
            ) : null}
            {locution.antonyms.length ? (
              <LexicalWordList
                emptyLabel=""
                label="Antonimos"
                onSelect={onReplaceSelectedWord}
                words={locution.antonyms.map((item) => item.word)}
              />
            ) : null}
          </div>
        ))}
      </div>
    </details>
  )
}

function LexicalSuggestions({
  suggestions,
}: {
  suggestions: readonly string[]
}) {
  if (!suggestions.length) {
    return null
  }

  return (
    <div className="continuum-lexical-group">
      <span>Sugerencias</span>
      <div className="continuum-lexical-chips continuum-lexical-chips-static">
        {suggestions.map((suggestion) => (
          <span key={suggestion}>{suggestion}</span>
        ))}
      </div>
    </div>
  )
}

function LexicalWordList({
  emptyLabel,
  label,
  onSelect,
  words,
}: {
  emptyLabel: string
  label: string
  onSelect: (word: string) => void
  words: readonly string[]
}) {
  return (
    <div className="continuum-lexical-group">
      <span>{label}</span>
      {words.length ? (
        <div className="continuum-lexical-chips">
          {words.map((word) => (
            <button
              key={word}
              type="button"
              onClick={() => onSelect(word)}
              onMouseDown={(event) => event.preventDefault()}
            >
              {word}
            </button>
          ))}
        </div>
      ) : (
        <p>{emptyLabel}</p>
      )}
    </div>
  )
}

function MenuButton({
  children,
  disabled,
  icon,
  onClick,
  title,
}: {
  children: ReactNode
  disabled?: boolean
  icon: string
  onClick: () => void
  title?: string
}) {
  return (
    <button
      className="continuum-menu-button"
      disabled={disabled}
      onClick={onClick}
      onMouseDown={(event) => event.preventDefault()}
      title={title}
      type="button"
    >
      <span className="continuum-menu-icon" aria-hidden="true">
        {icon}
      </span>
      <span>{children}</span>
    </button>
  )
}

function ReferenceResolver({
  body,
  filteredReferences,
  label,
  onClear,
  onReferenceSearchChange,
  onSelect,
  reference,
  referenceSearch,
  selectedReferenceId,
}: {
  body?: string
  filteredReferences: readonly StructuredNoteDraftReference[]
  label: string
  onClear: () => void
  onReferenceSearchChange: (value: string) => void
  onSelect: (referenceId: string) => void
  reference?: StructuredNoteDraftReference
  referenceSearch: string
  selectedReferenceId: string
}) {
  return (
    <div className="continuum-reference-resolver">
      <div className="continuum-reference-summary">
        <span>{label}</span>
        <strong>{reference ? formatReferenceLabel(reference) : "Sin referencia"}</strong>
        {body ? <p>{body}</p> : null}
      </div>
      <label className="continuum-menu-field">
        <span>Buscar</span>
        <input
          type="search"
          value={referenceSearch}
          placeholder="Autor, obra o texto"
          onChange={(event) => onReferenceSearchChange(event.currentTarget.value)}
        />
      </label>
      <label className="continuum-menu-field">
        <span>Referencia</span>
        <select
          value={selectedReferenceId}
          onChange={(event) => onSelect(event.currentTarget.value)}
        >
          <option value="">Sin referencia</option>
          {filteredReferences.map((item) => (
            <option key={item.id} value={item.id}>
              {formatReferenceLabel(item)}
            </option>
          ))}
        </select>
      </label>
      {selectedReferenceId ? (
        <MenuButton icon="-" onClick={onClear}>
          Quitar referencia
        </MenuButton>
      ) : null}
    </div>
  )
}

function ReferenceCreateForm({
  creatingReference,
  input,
  mode,
  onChange,
  onSubmit,
  referenceLibrary,
}: {
  creatingReference: boolean
  input: ContinuumEditorMenuReferenceInput
  mode: "library" | "active-target"
  onChange: (input: ContinuumEditorMenuReferenceInput) => void
  onSubmit: (
    event: FormEvent<HTMLFormElement>,
    mode: "library" | "active-target",
  ) => void
  referenceLibrary: readonly StructuredNoteDraftReference[]
}) {
  const authorSuggestions = useMemo(
    () => [...new Set(referenceLibrary.map((r) => r.author).filter(Boolean))].sort() as string[],
    [referenceLibrary],
  )

  const handleAuthorChange = (author: string) => {
    const match = referenceLibrary.find((r) => r.author === author)
    onChange({
      ...input,
      author,
      ...(match
        ? {
            authorBirthYear: match.authorBirthYear?.toString() ?? input.authorBirthYear,
            authorDeathYear: match.authorDeathYear?.toString() ?? input.authorDeathYear,
          }
        : {}),
    })
  }
  const submitLabel =
    mode === "active-target" ? "Crear y asociar referencia" : "Crear referencia"

  return (
    <form
      className="continuum-reference-form"
      onSubmit={(event) => onSubmit(event, mode)}
    >
      <div className="continuum-menu-subtitle">Nueva referencia</div>
      <label className="continuum-menu-field">
        <span>Autor</span>
        <input
          type="text"
          list="reference-author-suggestions"
          value={input.author}
          onChange={(event) => handleAuthorChange(event.currentTarget.value)}
        />
        <datalist id="reference-author-suggestions">
          {authorSuggestions.map((author) => (
            <option key={author} value={author} />
          ))}
        </datalist>
      </label>
      <label className="continuum-menu-field">
        <span>Obra</span>
        <input
          type="text"
          value={input.work}
          onChange={(event) => onChange({ ...input, work: event.currentTarget.value })}
        />
      </label>
      <label className="continuum-menu-field">
        <span>Texto</span>
        <textarea
          rows={3}
          value={input.body}
          placeholder="Referencia"
          onChange={(event) => onChange({ ...input, body: event.currentTarget.value })}
        />
      </label>
      <details className="continuum-reference-details">
        <summary>Detalles</summary>
        <div className="continuum-menu-field-grid">
          <label className="continuum-menu-field">
            <span>Fecha obra</span>
            <input
              type="text"
              value={input.workDate}
              onChange={(event) =>
                onChange({ ...input, workDate: event.currentTarget.value })
              }
            />
          </label>
          <label className="continuum-menu-field">
            <span>Edicion</span>
            <input
              type="text"
              value={input.edition}
              onChange={(event) =>
                onChange({ ...input, edition: event.currentTarget.value })
              }
            />
          </label>
          <label className="continuum-menu-field">
            <span>Nac.</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9-]*"
              value={input.authorBirthYear}
              onChange={(event) =>
                onChange({ ...input, authorBirthYear: event.currentTarget.value })
              }
            />
          </label>
          <label className="continuum-menu-field">
            <span>Muerte</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9-]*"
              value={input.authorDeathYear}
              onChange={(event) =>
                onChange({ ...input, authorDeathYear: event.currentTarget.value })
              }
            />
          </label>
        </div>
        <label className="continuum-menu-field">
          <span>Traductor</span>
          <input
            type="text"
            value={input.translator}
            onChange={(event) =>
              onChange({ ...input, translator: event.currentTarget.value })
            }
          />
        </label>
        <label className="continuum-menu-field">
          <span>Fuente</span>
          <textarea
            rows={3}
            value={input.sourceText}
            onChange={(event) =>
              onChange({ ...input, sourceText: event.currentTarget.value })
            }
          />
        </label>
        <label className="continuum-menu-field">
          <span>Comentario</span>
          <textarea
            rows={3}
            value={input.comment}
            onChange={(event) =>
              onChange({ ...input, comment: event.currentTarget.value })
            }
          />
        </label>
      </details>
      <button
        className="continuum-menu-button continuum-menu-button-primary"
        disabled={creatingReference}
        onMouseDown={(event) => event.preventDefault()}
        type="submit"
      >
        <span className="continuum-menu-icon" aria-hidden="true">
          +
        </span>
        <span>{creatingReference ? "Creando..." : submitLabel}</span>
      </button>
    </form>
  )
}
