import type { CorrectionSuggestion, CorrectionUsageMetadata } from "@continuum/correction"
import { renderCorrectedPreview } from "@continuum/correction"
import type { SelectionPlainTextMap } from "@continuum/editor"

export type ContinuumAiPanelCorrectionState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "error"
      message: string
    }
  | {
      status: "ready"
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
  selectionSummary: string
}

function suggestionLabel(suggestion: CorrectionSuggestion) {
  if (suggestion.original && suggestion.replacement) {
    return `${suggestion.original} → ${suggestion.replacement}`
  }
  if (suggestion.replacement) {
    return `Agregar: ${suggestion.replacement}`
  }
  return `Quitar: ${suggestion.original}`
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

export function ContinuumAiPanel({
  canApplyAll,
  configured,
  correction,
  isOpen,
  onApplyAll,
  onApplySuggestion,
  onClose,
  onRunCorrection,
  selectionSummary,
}: ContinuumAiPanelProps) {
  if (!isOpen) {
    return null
  }

  const ready = correction.status === "ready"
  return (
    <aside className="continuum-ai-panel" aria-label="Panel de corrección con IA">
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
            Configurá <code>VITE_OPENAI_API_KEY</code> para habilitar la corrección.
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
            <span className="continuum-ai-panel-label">Vista previa corregida</span>
            <div className="continuum-ai-panel-preview">
              {renderCorrectedPreview(correction.originalText, correction.correctedText).map(
                (segment, index) => (
                  <span
                    key={`${segment.kind}-${index}`}
                    className={
                      segment.kind === "changed"
                        ? "continuum-ai-panel-preview-change"
                        : undefined
                    }
                  >
                    {segment.text}
                  </span>
                ),
              )}
            </div>
          </section>

          <section className="continuum-ai-panel-section">
            <div className="continuum-ai-panel-suggestions-header">
              <span className="continuum-ai-panel-label">Correcciones sugeridas</span>
              {canApplyAll ? (
                <button type="button" className="continuum-ai-panel-secondary" onClick={onApplyAll}>
                  Aplicar todas
                </button>
              ) : null}
            </div>
            {correction.suggestions.length === 0 ? (
              <p className="continuum-ai-panel-hint">No se detectaron cambios.</p>
            ) : (
              <ul className="continuum-ai-panel-suggestions">
                {correction.suggestions.map((suggestion) => {
                  const statusLabel = suggestionStatusLabel(suggestion.status)
                  const disabled = suggestion.status !== "pending"

                  return (
                    <li key={suggestion.id}>
                      <button
                        type="button"
                        className="continuum-ai-panel-suggestion"
                        disabled={disabled}
                        onClick={() => onApplySuggestion(suggestion.id)}
                      >
                        <span>{suggestionLabel(suggestion)}</span>
                        {statusLabel ? <small>{statusLabel}</small> : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
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
