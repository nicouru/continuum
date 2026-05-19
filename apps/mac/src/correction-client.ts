import { fetch as tauriFetch } from "@tauri-apps/plugin-http"
import {
  OpenAiCorrectionProvider,
  type CorrectionFetchLike,
  type CorrectionProvider,
} from "@continuum/correction"

export function createContinuumCorrectionProvider(apiKey?: string | null): CorrectionProvider {
  const resolvedApiKey = apiKey?.trim() || import.meta.env.VITE_OPENAI_API_KEY?.trim()

  return new OpenAiCorrectionProvider({
    apiKey: resolvedApiKey,
    model: import.meta.env.VITE_OPENAI_CORRECTION_MODEL?.trim(),
    promptCacheKey: import.meta.env.VITE_OPENAI_PROMPT_CACHE_KEY?.trim(),
    promptCacheRetention: import.meta.env.VITE_OPENAI_PROMPT_CACHE_RETENTION?.trim(),
    fetchImpl: tauriFetch as CorrectionFetchLike,
  })
}

export function isCorrectionConfigured(apiKey?: string | null) {
  return Boolean(apiKey?.trim() || import.meta.env.VITE_OPENAI_API_KEY?.trim())
}
