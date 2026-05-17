import { describe, expect, it } from "vitest"
import { CORRECTION_RESPONSE_JSON_SCHEMA } from "./schema"
import {
  buildOpenAiCorrectionRequestBody,
  OpenAiCorrectionProvider,
  SYSTEM_INSTRUCTION,
} from "./openai-provider"
import { parseOpenAiCorrectionUsage } from "./parser"
import {
  DEFAULT_PROMPT_CACHE_KEY,
  resolvePromptCacheRetention,
} from "./openai-config"

describe("buildOpenAiCorrectionRequestBody", () => {
  it("includes a stable prompt_cache_key and keeps selected text in input", () => {
    const body = buildOpenAiCorrectionRequestBody({
      model: "gpt-5.4-mini",
      promptCacheKey: DEFAULT_PROMPT_CACHE_KEY,
      text: "esta frase",
    })

    expect(body.prompt_cache_key).toBe("continuum-ai-correction-v1")
    expect(body.instructions).toBe(SYSTEM_INSTRUCTION)
    expect(body.model).toBe("gpt-5.4-mini")
    expect(body.prompt_cache_retention).toBeUndefined()
    expect(body.instructions).not.toContain("esta frase")
    expect(body.input).toEqual([
      {
        role: "user",
        content: [{ type: "input_text", text: "esta frase" }],
      },
    ])
    expect(body.text).toMatchObject({
      format: {
        type: "json_schema",
        strict: true,
        schema: CORRECTION_RESPONSE_JSON_SCHEMA,
      },
    })
  })

  it("includes prompt_cache_retention only when configured", () => {
    const withoutRetention = buildOpenAiCorrectionRequestBody({
      model: "gpt-5.4-mini",
      promptCacheKey: DEFAULT_PROMPT_CACHE_KEY,
      text: "hola",
    })
    const withRetention = buildOpenAiCorrectionRequestBody({
      model: "gpt-5.4-mini",
      promptCacheKey: DEFAULT_PROMPT_CACHE_KEY,
      promptCacheRetention: "in-memory",
      text: "hola",
    })

    expect(withoutRetention.prompt_cache_retention).toBeUndefined()
    expect(withRetention.prompt_cache_retention).toBe("in-memory")
  })
})

describe("resolvePromptCacheRetention", () => {
  it("normalizes legacy underscore env values to the Responses API form", () => {
    expect(resolvePromptCacheRetention("in_memory")).toBe("in-memory")
    expect(resolvePromptCacheRetention("in-memory")).toBe("in-memory")
    expect(resolvePromptCacheRetention("24h")).toBe("24h")
    expect(resolvePromptCacheRetention("nope")).toBeUndefined()
  })
})

describe("parseOpenAiCorrectionUsage", () => {
  it("extracts cached_tokens from usage.input_tokens_details", async () => {
    const provider = new OpenAiCorrectionProvider({
      apiKey: "test-key",
      promptCacheKey: "continuum-ai-correction-v1",
      promptCacheRetention: "in-memory",
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        text: async () => "",
        json: async () => ({
          model: "gpt-5.4-mini",
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    corrected_text: "está",
                    warnings: [],
                  }),
                },
              ],
            },
          ],
          usage: {
            input_tokens: 1200,
            input_tokens_details: { cached_tokens: 1024 },
            output_tokens: 20,
            total_tokens: 1220,
          },
        }),
      }),
    })

    const result = await provider.correct({
      text: "esta",
      locale: "es-UY",
      mode: "orthography_grammar",
    })

    expect(result.usage).toEqual({
      inputTokens: 1200,
      cachedInputTokens: 1024,
      outputTokens: 20,
      totalTokens: 1220,
      model: "gpt-5.4-mini",
      promptCacheKey: "continuum-ai-correction-v1",
      promptCacheRetention: "in-memory",
    })
  })

  it("also extracts cached_tokens from prompt_tokens_details aliases", () => {
    expect(
      parseOpenAiCorrectionUsage({
        model: "gpt-5.4-mini",
        usage: {
          prompt_tokens: 1200,
          prompt_tokens_details: { cached_tokens: 1024 },
          completion_tokens: 20,
          total_tokens: 1220,
        },
      }),
    ).toEqual({
      inputTokens: 1200,
      cachedInputTokens: 1024,
      outputTokens: 20,
      totalTokens: 1220,
      model: "gpt-5.4-mini",
    })
  })

  it("does not crash when usage is missing", async () => {
    const provider = new OpenAiCorrectionProvider({
      apiKey: "test-key",
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        text: async () => "",
        json: async () => ({
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    corrected_text: "igual",
                    warnings: [],
                  }),
                },
              ],
            },
          ],
        }),
      }),
    })

    const result = await provider.correct({
      text: "igual",
      locale: "es-UY",
      mode: "orthography_grammar",
    })

    expect(result.usage).toBeUndefined()
    expect(parseOpenAiCorrectionUsage({})).toBeUndefined()
  })
})
