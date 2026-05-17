import type { CorrectionUsageMetadata } from "./types"
import { validateCorrectionModelResponse } from "./validate"

type ResponsesOutputItem = {
  content?: Array<{
    text?: string
    type?: string
  }>
  type?: string
}

export type OpenAiCorrectionUsageContext = {
  model?: string
  promptCacheKey?: string
  promptCacheRetention?: "in_memory" | "24h"
}

export function parseOpenAiCorrectionUsage(
  body: unknown,
  context: OpenAiCorrectionUsageContext = {},
): CorrectionUsageMetadata | undefined {
  if (!body || typeof body !== "object") {
    return undefined
  }

  const record = body as Record<string, unknown>
  const usage = record.usage

  if (!usage || typeof usage !== "object") {
    return undefined
  }

  const usageRecord = usage as Record<string, unknown>
  const metadata: CorrectionUsageMetadata = {}

  if (typeof usageRecord.input_tokens === "number") {
    metadata.inputTokens = usageRecord.input_tokens
  }

  if (typeof usageRecord.output_tokens === "number") {
    metadata.outputTokens = usageRecord.output_tokens
  }

  if (typeof usageRecord.total_tokens === "number") {
    metadata.totalTokens = usageRecord.total_tokens
  }

  const inputDetails = usageRecord.input_tokens_details

  if (inputDetails && typeof inputDetails === "object") {
    const cached = (inputDetails as Record<string, unknown>).cached_tokens

    if (typeof cached === "number") {
      metadata.cachedInputTokens = cached
    }
  }

  if (context.model) {
    metadata.model = context.model
  } else if (typeof record.model === "string") {
    metadata.model = record.model
  }

  if (context.promptCacheKey) {
    metadata.promptCacheKey = context.promptCacheKey
  }

  if (context.promptCacheRetention) {
    metadata.promptCacheRetention = context.promptCacheRetention
  }

  if (
    metadata.inputTokens === undefined &&
    metadata.cachedInputTokens === undefined &&
    metadata.outputTokens === undefined &&
    metadata.totalTokens === undefined &&
    metadata.model === undefined &&
    metadata.promptCacheKey === undefined &&
    metadata.promptCacheRetention === undefined
  ) {
    return undefined
  }

  return metadata
}

export function parseOpenAiCorrectionResponseBody(body: unknown): {
  corrected_text: string
  warnings: string[]
} {
  if (!body || typeof body !== "object") {
    throw new Error("La respuesta de OpenAI no es un objeto JSON.")
  }

  const record = body as Record<string, unknown>
  const output = record.output

  if (!Array.isArray(output)) {
    throw new Error("La respuesta de OpenAI no incluye output.")
  }

  const textChunks: string[] = []

  for (const item of output as ResponsesOutputItem[]) {
    if (item.type !== "message" || !Array.isArray(item.content)) {
      continue
    }

    for (const content of item.content) {
      if (content.type === "output_text" && typeof content.text === "string") {
        textChunks.push(content.text)
      }
    }
  }

  const combined = textChunks.join("").trim()

  if (!combined) {
    throw new Error("La respuesta de OpenAI no incluye texto de salida.")
  }

  return validateCorrectionModelResponse(JSON.parse(combined))
}
