import type {
  ActiveCitationDetails,
  ActiveReferenceInsertDetails,
} from "@continuum/editor"
import { formatReferenceLabel } from "@continuum/editor"
import type { StructuredNoteDraftReference } from "@continuum/core"
import type { CSSProperties, FormEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

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

const MENU_WIDTH = 248
const FLYOUT_WIDTH = 340
const VIEWPORT_MARGIN = 10

function clampMenuPosition(x: number, y: number, width: number, height: number) {
  return {
    x: Math.max(
      VIEWPORT_MARGIN,
      Math.min(x, window.innerWidth - Math.min(width, window.innerWidth - VIEWPORT_MARGIN * 2) - VIEWPORT_MARGIN),
    ),
    y: Math.max(
      VIEWPORT_MARGIN,
      Math.min(y, window.innerHeight - Math.min(height, window.innerHeight - VIEWPORT_MARGIN * 2) - VIEWPORT_MARGIN),
    ),
  }
}

function computeFlyoutPosition(anchor: DOMRect, flyoutHeight: number) {
  const flyoutWidth = Math.min(FLYOUT_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2)
  let left = anchor.right + 6
  if (left + flyoutWidth > window.innerWidth - VIEWPORT_MARGIN) {
    left = Math.max(VIEWPORT_MARGIN, anchor.left - flyoutWidth - 6)
  }

  let top = anchor.top
  const maxTop = window.innerHeight - VIEWPORT_MARGIN - flyoutHeight
  if (top > maxTop) {
    top = Math.max(VIEWPORT_MARGIN, maxTop)
  }

  return { left, top, width: flyoutWidth }
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
  const [menuPosition, setMenuPosition] = useState({ x, y })
  const [openSectionId, setOpenSectionId] = useState<string | null>(null)
  const dragStateRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)
  const menuRef = useRef<HTMLElement | null>(null)

  const hasActiveReferenceTarget = Boolean(activeCitation || activeReferenceInsert)

  useEffect(() => {
    if (isOpen) {
      setMenuPosition(clampMenuPosition(x, y, MENU_WIDTH, 420))
      setOpenSectionId(hasActiveReferenceTarget ? "referencias" : null)
    }
  }, [hasActiveReferenceTarget, isOpen, x, y])

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
        menuRef.current?.offsetHeight ?? 420,
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

  const menuStyle = {
    left: menuPosition.x,
    top: menuPosition.y,
    width: MENU_WIDTH,
  } satisfies CSSProperties

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
        style={menuStyle}
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

        <MenuFlyoutSection
          icon="T"
          isOpen={openSectionId === "texto"}
          onToggle={() =>
            setOpenSectionId((current) => (current === "texto" ? null : "texto"))
          }
          sectionId="texto"
          title="Texto"
        >
          <div className="continuum-menu-list">
            <MenuButton icon="§" onClick={onToggleAphorism}>
              Aforismo
            </MenuButton>
            <MenuButton icon="§§" onClick={onMarkAllParagraphsAsAphorisms}>
              Marcar todos como aforismos
            </MenuButton>
            <MenuButton
              disabled={!canModifyAphorism}
              icon="§−"
              onClick={onUnmarkAphorism}
              title={
                canModifyAphorism
                  ? undefined
                  : "Pon el cursor sobre un aforismo para quitarlo."
              }
            >
              Quitar aforismo
            </MenuButton>
            <MenuButton icon="↥" onClick={onJoinPreviousAphorism}>
              Unir al anterior
            </MenuButton>
            <MenuButton
              disabled={!canModifyAphorism}
              icon="↧"
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
        </MenuFlyoutSection>

        <MenuFlyoutSection
          icon="R"
          isOpen={openSectionId === "referencias"}
          onToggle={() =>
            setOpenSectionId((current) =>
              current === "referencias" ? null : "referencias",
            )
          }
          sectionId="referencias"
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
        </MenuFlyoutSection>

        <MenuFlyoutSection
          icon="N"
          isOpen={openSectionId === "nota"}
          onToggle={() =>
            setOpenSectionId((current) => (current === "nota" ? null : "nota"))
          }
          sectionId="nota"
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
        </MenuFlyoutSection>

        <MenuFlyoutSection
          icon="↻"
          isOpen={openSectionId === "sync"}
          onToggle={() =>
            setOpenSectionId((current) => (current === "sync" ? null : "sync"))
          }
          sectionId="sync"
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
        </MenuFlyoutSection>

        <MenuFlyoutSection
          icon="C"
          isOpen={openSectionId === "app"}
          onToggle={() =>
            setOpenSectionId((current) => (current === "app" ? null : "app"))
          }
          sectionId="app"
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
        </MenuFlyoutSection>
      </aside>
    </div>
  )
}

function MenuFlyoutSection({
  children,
  icon,
  isOpen,
  onToggle,
  sectionId,
  title,
}: {
  children: ReactNode
  icon: string
  isOpen: boolean
  onToggle: () => void
  sectionId: string
  title: string
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const flyoutRef = useRef<HTMLDivElement | null>(null)
  const [flyoutStyle, setFlyoutStyle] = useState<CSSProperties>({ visibility: "hidden" })

  const repositionFlyout = useCallback(() => {
    if (!isOpen || !triggerRef.current || !flyoutRef.current) {
      return
    }
    const anchor = triggerRef.current.getBoundingClientRect()
    const flyoutHeight = flyoutRef.current.offsetHeight
    const position = computeFlyoutPosition(anchor, flyoutHeight)
    setFlyoutStyle({
      left: position.left,
      top: position.top,
      width: position.width,
      visibility: "visible",
    })
  }, [isOpen])

  useLayoutEffect(() => {
    if (!isOpen) {
      return
    }
    repositionFlyout()
    window.addEventListener("resize", repositionFlyout)
    return () => window.removeEventListener("resize", repositionFlyout)
  }, [isOpen, repositionFlyout, children])

  return (
  <>
    <button
      ref={triggerRef}
      type="button"
      className={`continuum-menu-flyout-trigger${isOpen ? " is-open" : ""}`}
      aria-expanded={isOpen}
      aria-controls={`continuum-menu-flyout-${sectionId}`}
      onClick={onToggle}
      onMouseDown={(event) => event.preventDefault()}
    >
      <span className="continuum-menu-icon" aria-hidden="true">
        {icon}
      </span>
      <span>{title}</span>
      <span className="continuum-menu-chevron continuum-menu-chevron-right" aria-hidden="true">
        ›
      </span>
    </button>
    {isOpen
      ? createPortal(
          <div
            ref={flyoutRef}
            id={`continuum-menu-flyout-${sectionId}`}
            className="continuum-menu-flyout"
            style={flyoutStyle}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="continuum-menu-flyout-body">{children}</div>
          </div>,
          document.body,
        )
      : null}
  </>
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
