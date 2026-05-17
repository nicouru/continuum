import { CORRECTION_RESPONSE_JSON_SCHEMA } from "./schema"
import {
  resolvePromptCacheKey,
  resolvePromptCacheRetention,
  type PromptCacheRetention,
} from "./openai-config"
import { parseOpenAiCorrectionResponseBody, parseOpenAiCorrectionUsage } from "./parser"
import {
  CorrectionError,
  type CorrectionProvider,
  type CorrectionProviderOptions,
  type CorrectionRequest,
  type CorrectionResult,
} from "./types"

export type CorrectionFetchLike = (
  input: string,
  init?: {
    body?: string
    headers?: Record<string, string>
    method?: string
    signal?: AbortSignal
    timeout?: number
  },
) => Promise<{
  json(): Promise<unknown>
  ok: boolean
  status: number
  text(): Promise<string>
}>

export type OpenAiCorrectionProviderOptions = {
  apiKey?: string
  fetchImpl?: CorrectionFetchLike
  model?: string
  promptCacheKey?: string
  promptCacheRetention?: string
  timeoutSeconds?: number
}

export type OpenAiCorrectionRequestConfig = {
  model: string
  promptCacheKey: string
  promptCacheRetention?: PromptCacheRetention
  text: string
}

const DEFAULT_MODEL = "gpt-5.4-mini"
const DEFAULT_API_URL = "https://api.openai.com/v1/responses"

export const SYSTEM_INSTRUCTION = `You are a conservative Spanish Rioplatense proofreader.
Correct only orthography, accents, obvious grammar, and necessary punctuation.
Preserve style, tone, vocabulary, sentence order, paragraph breaks, quotations, and meaning.
Do not rewrite for elegance.
Do not shorten or expand.
Return exactly the same text except for necessary corrections.
If the text is already correct, return it unchanged.
Output must match the JSON schema.`

export function buildOpenAiCorrectionRequestBody(config: OpenAiCorrectionRequestConfig) {
  const body: Record<string, unknown> = {
    model: config.model,
    instructions: SYSTEM_INSTRUCTION,
    prompt_cache_key: config.promptCacheKey,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: config.text,
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "continuum_correction",
        strict: true,
        schema: CORRECTION_RESPONSE_JSON_SCHEMA,
      },
    },
  }

  if (config.promptCacheRetention) {
    body.prompt_cache_retention = config.promptCacheRetention
  }

  return body
}

export class OpenAiCorrectionProvider implements CorrectionProvider {
  readonly id = "openai"
  private readonly apiKey?: string
  private readonly fetchImpl: CorrectionFetchLike
  private readonly model: string
  private readonly promptCacheKey: string
  private readonly promptCacheRetention?: PromptCacheRetention
  private readonly timeoutSeconds: number

  constructor(options: OpenAiCorrectionProviderOptions = {}) {
    this.apiKey = options.apiKey?.trim() || undefined
    this.fetchImpl =
      options.fetchImpl ?? (globalThis.fetch.bind(globalThis) as CorrectionFetchLike)
    this.model = options.model?.trim() || DEFAULT_MODEL
    this.promptCacheKey = resolvePromptCacheKey(options.promptCacheKey)
    this.promptCacheRetention = resolvePromptCacheRetention(options.promptCacheRetention)
    this.timeoutSeconds = options.timeoutSeconds ?? 45
  }

  async correct(
    request: CorrectionRequest,
    options: CorrectionProviderOptions = {},
  ): Promise<CorrectionResult> {
    const text = request.text

    if (!text.trim()) {
      throw new CorrectionError("No hay texto seleccionado para corregir.", this.id)
    }

    if (!this.apiKey) {
      throw new CorrectionError(
        "Falta configurar una API key de OpenAI para usar la corrección con IA.",
        this.id,
      )
    }

    const requestBody = buildOpenAiCorrectionRequestBody({
      model: this.model,
      promptCacheKey: this.promptCacheKey,
      promptCacheRetention: this.promptCacheRetention,
      text,
    })

    const response = await this.fetchImpl(DEFAULT_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: options.signal,
      timeout: this.timeoutSeconds,
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new CorrectionError(
        errorBody.trim() || `OpenAI respondió con estado ${response.status}.`,
        this.id,
        response.status,
      )
    }

    const responseBody = await response.json()
    const parsed = parseOpenAiCorrectionResponseBody(responseBody)
    const usage = parseOpenAiCorrectionUsage(responseBody, {
      model: this.model,
      promptCacheKey: this.promptCacheKey,
      promptCacheRetention: this.promptCacheRetention,
    })

    return {
      originalText: text,
      correctedText: parsed.corrected_text,
      warnings: parsed.warnings,
      source: {
        id: this.id,
        label: "OpenAI",
      },
      usage,
    }
  }
}
