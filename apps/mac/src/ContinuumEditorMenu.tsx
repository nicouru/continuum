import type {
  ActiveCitationDetails,
  ActiveReferenceInsertDetails,
} from "@continuum/editor"
import { formatReferenceLabel } from "@continuum/editor"
import type { StructuredNoteDraftReference } from "@continuum/core"
import type {
  CSSProperties,
  FormEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"

const MENU_WIDTH = 430
const VIEWPORT_MARGIN = 10

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
  folder: "all" | "trash"
  isOpen: boolean
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
  folder,
  isOpen,
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
  const dragStateRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)
  const menuRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (isOpen) {
      setMenuPosition({ x, y })
    }
  }, [isOpen, x, y])

  useLayoutEffect(() => {
    if (!isOpen || !menuRef.current) {
      return
    }

    const { offsetHeight } = menuRef.current
    setMenuPosition((current) =>
      clampMenuPosition(current.x, current.y, MENU_WIDTH, offsetHeight),
    )
  }, [isOpen, x, y])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragStateRef.current
      if (!drag || event.pointerId !== drag.pointerId) {
        return
      }
      const next = clampMenuPosition(
        drag.originX + (event.clientX - drag.startX),
        drag.originY + (event.clientY - drag.startY),
        MENU_WIDTH,
        menuRef.current?.offsetHeight ?? 720,
      )
      setMenuPosition(next)
    }

    const handlePointerUp = (event: PointerEvent) => {
      const drag = dragStateRef.current
      if (!drag || event.pointerId !== drag.pointerId) {
        return
      }
      dragStateRef.current = null
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerUp)

    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerUp)
    }
  }, [isOpen])

  const handleHeaderPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) {
      return
    }
    event.preventDefault()
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: menuPosition.x,
      originY: menuPosition.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  if (!isOpen) {
    return null
  }

  const style = {
    left: menuPosition.x,
    top: menuPosition.y,
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
        <div
          className="continuum-menu-header continuum-menu-header-draggable"
          onPointerDown={handleHeaderPointerDown}
        >
          <span>Editor</span>
          <button type="button" onClick={onClose} aria-label="Cerrar menu">
            Esc
          </button>
        </div>

        <MenuSection defaultOpen icon="T" title="Texto">
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
          defaultOpen={hasActiveReferenceTarget}
          icon="R"
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
          />
        </MenuSection>

        <MenuSection icon="N" title="Nota">
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

        <MenuSection icon="↻" title="Sincronizacion">
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

        <MenuSection icon="C" title="Aplicacion">
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
  defaultOpen = false,
  icon,
  title,
}: {
  children: ReactNode
  defaultOpen?: boolean
  icon: string
  title: string
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <details className="continuum-menu-section" open={open}>
      <summary
        onClick={(event) => {
          event.preventDefault()
          setOpen((current) => !current)
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
}: {
  creatingReference: boolean
  input: ContinuumEditorMenuReferenceInput
  mode: "library" | "active-target"
  onChange: (input: ContinuumEditorMenuReferenceInput) => void
  onSubmit: (
    event: FormEvent<HTMLFormElement>,
    mode: "library" | "active-target",
  ) => void
}) {
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
          value={input.author}
          onChange={(event) => onChange({ ...input, author: event.currentTarget.value })}
        />
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
              type="number"
              value={input.authorBirthYear}
              onChange={(event) =>
                onChange({ ...input, authorBirthYear: event.currentTarget.value })
              }
            />
          </label>
          <label className="continuum-menu-field">
            <span>Muerte</span>
            <input
              type="number"
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
