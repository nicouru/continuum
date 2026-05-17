export const DEFAULT_PROMPT_CACHE_KEY = "continuum-ai-correction-v1"

export type PromptCacheRetention = "in_memory" | "24h"

export function resolvePromptCacheKey(value: string | undefined): string {
  const trimmed = value?.trim()
  return trimmed || DEFAULT_PROMPT_CACHE_KEY
}

export function resolvePromptCacheRetention(
  value: string | undefined,
): PromptCacheRetention | undefined {
  const trimmed = value?.trim()

  if (!trimmed) {
    return undefined
  }

  if (trimmed === "in_memory" || trimmed === "24h") {
    return trimmed
  }

  return undefined
}
