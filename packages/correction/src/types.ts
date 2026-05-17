export type CorrectionLocale = "es-UY"

export type CorrectionMode = "orthography_grammar"

export type CorrectionRequest = {
  text: string
  locale: CorrectionLocale
  mode: CorrectionMode
}

export type CorrectionUsageMetadata = {
  inputTokens?: number
  cachedInputTokens?: number
  outputTokens?: number
  totalTokens?: number
  model?: string
  promptCacheKey?: string
  promptCacheRetention?: "in-memory" | "24h"
}

export type CorrectionResult = {
  originalText: string
  correctedText: string
  warnings: string[]
  source: {
    id: string
    label: string
  }
  usage?: CorrectionUsageMetadata
}

export type CorrectionProviderOptions = {
  signal?: AbortSignal
}

export interface CorrectionProvider {
  id: string
  correct(
    request: CorrectionRequest,
    options?: CorrectionProviderOptions,
  ): Promise<CorrectionResult>
}

export type CorrectionSuggestionStatus =
  | "pending"
  | "applied"
  | "skipped"
  | "stale"
  | "unsafe"

export type CorrectionSuggestion = {
  id: string
  original: string
  replacement: string
  originalOffset: number
  originalLength: number
  status: CorrectionSuggestionStatus
}

export class CorrectionError extends Error {
  constructor(
    message: string,
    readonly providerId: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = "CorrectionError"
  }
}
