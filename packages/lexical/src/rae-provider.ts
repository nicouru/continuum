import {
  LexicalLookupError,
  type LexicalDefinition,
  type LexicalLookupResult,
  type LexicalProvider,
  type LexicalProviderLookupOptions,
  type LexicalRelatedWord,
} from "./types"

export type LexicalFetchLike = (
  input: string,
  init?: {
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

export type RaeLexicalProviderOptions = {
  apiKey?: string
  baseUrl?: string
  fetchImpl?: LexicalFetchLike
  timeoutSeconds?: number
}

type RaeApiEnvelope =
  | {
      data?: {
        meanings?: RaeMeaning[]
        word?: string
      }
      ok?: true
      suggestions?: unknown
    }
  | {
      error?: string
      ok?: false
      suggestions?: string[] | null
    }

type RaeMeaning = {
  origin?: {
    raw?: string
  }
  locutions?: RaeLocution[]
  senses?: RaeSense[]
}

type RaeSense = {
  antonyms?: string[] | null
  antonyms_v2?: RaeRelatedWord[] | null
  category?: string
  description?: string
  raw?: string
  synonyms?: string[] | null
  synonyms_v2?: RaeRelatedWord[] | null
}

type RaeRelatedWord = {
  label?: string
  word?: string
}

type RaeLocution = {
  expression?: string
  senses?: RaeSense[]
}

const DEFAULT_RAE_API_BASE_URL = "https://rae-api.com/api/words"

export class RaeLexicalProvider implements LexicalProvider {
  readonly id = "rae"
  private readonly apiKey?: string
  private readonly baseUrl: string
  private readonly fetchImpl: LexicalFetchLike
  private readonly timeoutSeconds: number

  constructor(options: RaeLexicalProviderOptions = {}) {
    this.apiKey = options.apiKey?.trim() || undefined
    this.baseUrl = (options.baseUrl ?? DEFAULT_RAE_API_BASE_URL).replace(/\/+$/u, "")
    this.fetchImpl =
      options.fetchImpl ?? (globalThis.fetch.bind(globalThis) as LexicalFetchLike)
    this.timeoutSeconds = options.timeoutSeconds ?? 8
  }

  async lookup(
    term: string,
    options: LexicalProviderLookupOptions = {},
  ): Promise<LexicalLookupResult> {
    const normalizedTerm = term.trim()

    if (!normalizedTerm) {
      throw new LexicalLookupError("La palabra esta vacia.", this.id)
    }

    const url = new URL(`${this.baseUrl}/${encodeURIComponent(normalizedTerm)}`)

    if (this.apiKey) {
      url.searchParams.set("api_key", this.apiKey)
    }

    const response = await this.fetchImpl(url.toString(), {
      headers: { Accept: "application/json" },
      method: "GET",
      signal: options.signal,
      timeout: this.timeoutSeconds,
    })

    const payload = await readJson(response)

    if (!response.ok) {
      throw new LexicalLookupError(
        statusMessage(response.status),
        this.id,
        response.status,
      )
    }

    return parseRaeLexicalResponse(normalizedTerm, payload)
  }
}

export function parseRaeLexicalResponse(
  term: string,
  payload: unknown,
): LexicalLookupResult {
  const envelope = payload as RaeApiEnvelope

  if (!envelope || typeof envelope !== "object") {
    return emptyRaeResult(term, [])
  }

  if (envelope.ok === false) {
    return emptyRaeResult(
      term,
      Array.isArray(envelope.suggestions) ? envelope.suggestions : [],
    )
  }

  const data = "data" in envelope ? envelope.data : undefined
  const meanings = Array.isArray(data?.meanings) ? data.meanings : []
  const etymology = firstNonEmpty(
    meanings.map((meaning) => sanitizeText(meaning.origin?.raw ?? "")),
  )
  const allSenses = meanings.flatMap((meaning) => meaning.senses ?? [])
  const synonymDetails = uniqueRelatedWords(
    meanings.flatMap((meaning) =>
      (meaning.senses ?? []).flatMap((sense) => [
        ...relatedWordDetails(sense.synonyms_v2),
        ...relatedWordDetails(sense.synonyms),
      ]),
    ),
  )
  const antonymDetails = uniqueRelatedWords(
    meanings.flatMap((meaning) =>
      (meaning.senses ?? []).flatMap((sense) => [
        ...relatedWordDetails(sense.antonyms_v2),
        ...relatedWordDetails(sense.antonyms),
      ]),
    ),
  )
  const definitions = allSenses.map(definitionFromSense).filter(isDefinition)
  const rawSenses = uniqueTexts(allSenses.map((sense) => sanitizeText(sense.raw ?? "")))
  const locutions = meanings
    .flatMap((meaning) => meaning.locutions ?? [])
    .map(locutionFromRae)
    .filter((locution) => locution.expression)

  return {
    antonyms: antonymDetails.map((item) => item.word),
    antonymDetails,
    definitions,
    etymology,
    locutions,
    rawSenses,
    source: raeSource(term),
    suggestions: [],
    synonyms: synonymDetails.map((item) => item.word),
    synonymDetails,
    term: data?.word?.trim() || term,
  }
}

function emptyRaeResult(
  term: string,
  suggestions: string[],
): LexicalLookupResult {
  return {
    antonyms: [],
    antonymDetails: [],
    definitions: [],
    etymology: null,
    locutions: [],
    rawSenses: [],
    source: raeSource(term),
    suggestions,
    synonyms: [],
    synonymDetails: [],
    term,
  }
}

function raeSource(term: string) {
  return {
    id: "rae",
    label: "RAE API / DLE",
    url: `https://dle.rae.es/${encodeURIComponent(term)}`,
  }
}

function relatedWordDetails(
  value: RaeRelatedWord[] | string[] | null | undefined,
) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((item) => ({
    label: typeof item === "string" ? undefined : sanitizeText(item.label ?? ""),
    word: typeof item === "string" ? item : typeof item.word === "string" ? item.word : "",
  }))
}

function uniqueRelatedWords(words: LexicalRelatedWord[]) {
  const seen = new Set<string>()
  const result: LexicalRelatedWord[] = []

  for (const item of words) {
    const clean = sanitizeText(item.word)

    if (!clean) {
      continue
    }

    const key = clean.toLocaleLowerCase("es")

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    result.push({
      label: item.label ? sanitizeText(item.label) : undefined,
      word: clean,
    })
  }

  return result
}

function uniqueTexts(values: string[]) {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    if (!value || seen.has(value)) {
      continue
    }
    seen.add(value)
    result.push(value)
  }

  return result
}

function definitionFromSense(sense: RaeSense): LexicalDefinition | null {
  const description = sanitizeText(sense.description ?? "")

  if (!description) {
    return null
  }

  return {
    category: sanitizeText(sense.category ?? "") || undefined,
    description,
    raw: sanitizeText(sense.raw ?? "") || undefined,
  }
}

function isDefinition(
  definition: LexicalDefinition | null,
): definition is LexicalDefinition {
  return Boolean(definition)
}

function locutionFromRae(locution: RaeLocution) {
  const senses = locution.senses ?? []
  const synonymDetails = uniqueRelatedWords(
    senses.flatMap((sense) => [
      ...relatedWordDetails(sense.synonyms_v2),
      ...relatedWordDetails(sense.synonyms),
    ]),
  )
  const antonymDetails = uniqueRelatedWords(
    senses.flatMap((sense) => [
      ...relatedWordDetails(sense.antonyms_v2),
      ...relatedWordDetails(sense.antonyms),
    ]),
  )

  return {
    antonyms: antonymDetails,
    definitions: senses.map(definitionFromSense).filter(isDefinition),
    expression: sanitizeText(locution.expression ?? ""),
    synonyms: synonymDetails,
  }
}

function firstNonEmpty(values: string[]) {
  return values.find(Boolean) ?? null
}

function sanitizeText(value: string) {
  return value.replace(/\s+/gu, " ").trim()
}

async function readJson(response: Awaited<ReturnType<LexicalFetchLike>>) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function statusMessage(status: number) {
  if (status === 429) {
    return "RAE API limito temporalmente las consultas."
  }
  if (status === 401 || status === 403) {
    return "RAE API rechazo la clave configurada."
  }
  return `RAE API no respondio correctamente (${status}).`
}
