import type {
  CorrectionSessionIdentity,
  CorrectionSuggestion,
  CorrectionUsageMetadata,
} from "@continuum/correction"
import type { SelectionPlainTextMap } from "@continuum/editor"
import { useEffect, useState, type CSSProperties, type FormEvent } from "react"

export type ContinuumAiPanelCorrectionState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "error"
      message: string
    }
  | {
      status: "ready"
      session?: CorrectionSessionIdentity
      sourceText: string
      originalText: string
      correctedText: string
      warnings: string[]
      suggestions: CorrectionSuggestion[]
      map: SelectionPlainTextMap
      usage?: CorrectionUsageMetadata
    }

type ContinuumAiPanelProps = {
  configured: boolean
  correction: ContinuumAiPanelCorrectionState
  canApplyAll: boolean
  isOpen: boolean
  onApplyAll: () => void
  onApplySuggestion: (suggestionId: string) => void
  onClose: () => void
  onRunCorrection: () => void
  onClearApiKey: () => Promise<void> | void
  onSaveApiKey: (apiKey: string) => Promise<void> | void
  selectionSummary: string
  width: number
  x: number
  y: number
}

function suggestionStatusLabel(status: CorrectionSuggestion["status"]) {
  switch (status) {
    case "applied":
      return "Aplicada"
    case "skipped":
      return "Omitida"
    case "stale":
      return "Desactualizada"
    case "unsafe":
      return "No segura"
    default:
      return null
  }
}

type PreviewSegment =
  | { kind: "text"; text: string }
  | { kind: "suggestion"; suggestion: CorrectionSuggestion; text: string }

function buildActionablePreviewSegments(
  text: string,
  suggestions: CorrectionSuggestion[],
): PreviewSegment[] {
  const segments: PreviewSegment[] = []
  let cursor = 0

  const pendingSuggestions = suggestions
    .filter((suggestion) => suggestion.status === "pending")
    .sort((left, right) => left.originalOffset - right.originalOffset)

  for (const suggestion of pendingSuggestions) {
    const start = suggestion.originalOffset
    const end = start + suggestion.originalLength

    if (start < cursor || text.slice(start, end) !== suggestion.original) {
      continue
    }

    if (cursor < start) {
      segments.push({ kind: "text", text: text.slice(cursor, start) })
    }

    segments.push({
      kind: "suggestion",
      suggestion,
      text:
        suggestion.replacement ||
        (suggestion.original ? `Quitar “${suggestion.original}”` : "Aplicar"),
    })
    cursor = end
  }

  if (cursor < text.length) {
    segments.push({ kind: "text", text: text.slice(cursor) })
  }

  return segments.length > 0 ? segments : [{ kind: "text", text }]
}

export function ContinuumAiPanel({
  canApplyAll,
  configured,
  correction,
  isOpen,
  onApplyAll,
  onApplySuggestion,
  onClearApiKey,
  onClose,
  onRunCorrection,
  onSaveApiKey,
  selectionSummary,
  width,
  x,
  y,
}: ContinuumAiPanelProps) {
  const [apiKeyInput, setApiKeyInput] = useState("")
  const [apiKeyExpanded, setApiKeyExpanded] = useState(!configured)
  const [apiKeySaving, setApiKeySaving] = useState(false)
  const [apiKeyMessage, setApiKeyMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!configured) {
      setApiKeyExpanded(true)
    }
  }, [configured])

  if (!isOpen) {
    return null
  }

  const ready = correction.status === "ready"
  const style = {
    left: x,
    top: y,
    width,
  } satisfies CSSProperties

  const handleSaveApiKey = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextApiKey = apiKeyInput.trim()

    if (!nextApiKey) {
      setApiKeyMessage("Pegá una API key válida.")
      return
    }

    setApiKeySaving(true)
    setApiKeyMessage(null)

    try {
      await onSaveApiKey(nextApiKey)
      setApiKeyInput("")
      setApiKeyExpanded(false)
      setApiKeyMessage("API key guardada localmente.")
    } catch {
      setApiKeyMessage("No se pudo guardar la API key.")
    } finally {
      setApiKeySaving(false)
    }
  }

  const handleClearApiKey = async () => {
    setApiKeySaving(true)
    setApiKeyMessage(null)

    try {
      await onClearApiKey()
      setApiKeyInput("")
      setApiKeyExpanded(true)
      setApiKeyMessage("API key eliminada.")
    } catch {
      setApiKeyMessage("No se pudo eliminar la API key.")
    } finally {
      setApiKeySaving(false)
    }
  }

  return (
    <aside
      className="continuum-ai-panel"
      aria-label="Panel de corrección con IA"
      style={style}
    >
      <header className="continuum-ai-panel-header">
        <div>
          <strong>Corrección</strong>
          <p>Asistencia conservadora sobre la selección actual.</p>
        </div>
        <button type="button" className="continuum-ai-panel-close" onClick={onClose}>
          Cerrar
        </button>
      </header>

      <section className="continuum-ai-panel-section">
        <span className="continuum-ai-panel-label">Selección</span>
        <p className="continuum-ai-panel-selection">
          {selectionSummary || "Sin selección"}
        </p>
      </section>

      <section className="continuum-ai-panel-section">
        <div className="continuum-ai-panel-config-row">
          <span className="continuum-ai-panel-label">OpenAI</span>
          <button
            type="button"
            className="continuum-ai-panel-link-button"
            onClick={() => {
              setApiKeyExpanded((current) => !current)
              setApiKeyMessage(null)
            }}
          >
            {configured ? "Cambiar key" : "Configurar key"}
          </button>
        </div>
        {apiKeyExpanded ? (
          <form className="continuum-ai-panel-api-key-form" onSubmit={handleSaveApiKey}>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(event) => setApiKeyInput(event.currentTarget.value)}
              placeholder="sk-..."
              autoComplete="off"
              spellCheck={false}
              aria-label="OpenAI API key"
            />
            <div className="continuum-ai-panel-api-key-actions">
              <button
                type="submit"
                className="continuum-ai-panel-secondary"
                disabled={apiKeySaving}
              >
                Guardar
              </button>
              {configured ? (
                <button
                  type="button"
                  className="continuum-ai-panel-secondary"
                  disabled={apiKeySaving}
                  onClick={handleClearApiKey}
                >
                  Quitar
                </button>
              ) : null}
            </div>
            <p className="continuum-ai-panel-hint">
              Se guarda localmente en este Mac para probar la corrección.
            </p>
          </form>
        ) : (
          <p className="continuum-ai-panel-hint">
            {configured ? "API key configurada." : "API key no configurada."}
          </p>
        )}
        {apiKeyMessage ? (
          <p className="continuum-ai-panel-hint">{apiKeyMessage}</p>
        ) : null}
      </section>

      <section className="continuum-ai-panel-section">
        <button
          type="button"
          className="continuum-ai-panel-primary"
          disabled={!configured || correction.status === "loading" || !selectionSummary}
          onClick={onRunCorrection}
        >
          {correction.status === "loading"
            ? "Corrigiendo…"
            : "Corregir ortografía y gramática"}
        </button>
        {!configured ? (
          <p className="continuum-ai-panel-hint">
            Configurá una API key para habilitar la corrección.
          </p>
        ) : null}
      </section>

      {correction.status === "error" ? (
        <p className="continuum-ai-panel-error">{correction.message}</p>
      ) : null}

      {ready ? (
        <>
          {correction.warnings.length > 0 ? (
            <section className="continuum-ai-panel-section">
              <span className="continuum-ai-panel-label">Advertencias</span>
              <ul className="continuum-ai-panel-warnings">
                {correction.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="continuum-ai-panel-section">
            <div className="continuum-ai-panel-suggestions-header">
              <span className="continuum-ai-panel-label">Vista previa corregida</span>
              {canApplyAll ? (
                <button type="button" className="continuum-ai-panel-secondary" onClick={onApplyAll}>
                  Aplicar todas
                </button>
              ) : null}
            </div>
            <div className="continuum-ai-panel-preview">
              {correction.suggestions.length === 0 ? (
                <span className="continuum-ai-panel-preview-muted">
                  No se detectaron cambios.
                </span>
              ) : (
                buildActionablePreviewSegments(
                  correction.originalText,
                  correction.suggestions,
                ).map((segment, index) => {
                  if (segment.kind === "text") {
                    return <span key={`text-${index}`}>{segment.text}</span>
                  }

                  const statusLabel = suggestionStatusLabel(segment.suggestion.status)

                  return (
                    <button
                      key={segment.suggestion.id}
                      type="button"
                      className="continuum-ai-panel-preview-change"
                      disabled={segment.suggestion.status !== "pending"}
                      title={statusLabel ?? "Aplicar esta corrección"}
                      onClick={() => onApplySuggestion(segment.suggestion.id)}
                    >
                      {segment.text}
                    </button>
                  )
                })
              )}
            </div>
          </section>

          {correction.usage ? (
            <details className="continuum-ai-panel-usage">
              <summary>Uso de la API</summary>
              <dl>
                {correction.usage.model ? (
                  <>
                    <dt>Modelo</dt>
                    <dd>{correction.usage.model}</dd>
                  </>
                ) : null}
                {correction.usage.inputTokens !== undefined ? (
                  <>
                    <dt>Tokens de entrada</dt>
                    <dd>{correction.usage.inputTokens}</dd>
                  </>
                ) : null}
                {correction.usage.cachedInputTokens !== undefined ? (
                  <>
                    <dt>Tokens cacheados</dt>
                    <dd>{correction.usage.cachedInputTokens}</dd>
                  </>
                ) : null}
                {correction.usage.outputTokens !== undefined ? (
                  <>
                    <dt>Tokens de salida</dt>
                    <dd>{correction.usage.outputTokens}</dd>
                  </>
                ) : null}
                {correction.usage.promptCacheKey ? (
                  <>
                    <dt>prompt_cache_key</dt>
                    <dd>{correction.usage.promptCacheKey}</dd>
                  </>
                ) : null}
              </dl>
            </details>
          ) : null}
        </>
      ) : null}
    </aside>
  )
}
