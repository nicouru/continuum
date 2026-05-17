import type {
  LexicalLookupResult,
  LexicalProvider,
  LexicalProviderLookupOptions,
} from "./types"

export function createLexicalProviderChain(
  providers: readonly LexicalProvider[],
): LexicalProvider {
  return new LexicalProviderChain(providers)
}

class LexicalProviderChain implements LexicalProvider {
  readonly id: string

  constructor(private readonly providers: readonly LexicalProvider[]) {
    this.id = providers.map((provider) => provider.id).join("+") || "empty"
  }

  async lookup(
    term: string,
    options?: LexicalProviderLookupOptions,
  ): Promise<LexicalLookupResult> {
    const results: LexicalLookupResult[] = []
    let lastError: unknown

    for (const provider of this.providers) {
      try {
        results.push(await provider.lookup(term, options))
      } catch (error) {
        lastError = error
      }
    }

    if (results.length === 0) {
      throw lastError instanceof Error
        ? lastError
        : new Error("No hay proveedores lexicales configurados.")
    }

    return mergeLexicalResults(term, results)
  }
}

function mergeLexicalResults(
  term: string,
  results: readonly LexicalLookupResult[],
): LexicalLookupResult {
  const [first] = results

  return {
    antonyms: unique(results.flatMap((result) => result.antonyms)),
    antonymDetails: uniqueRelatedWords(
      results.flatMap((result) => result.antonymDetails),
    ),
    definitions: results.flatMap((result) => result.definitions),
    etymology: results.find((result) => result.etymology)?.etymology ?? null,
    locutions: results.flatMap((result) => result.locutions),
    rawSenses: unique(results.flatMap((result) => result.rawSenses)),
    source:
      results.length === 1
        ? results[0].source
        : {
            id: results.map((result) => result.source.id).join("+"),
            label: results.map((result) => result.source.label).join(" + "),
            url: first?.source.url,
          },
    suggestions: unique(results.flatMap((result) => result.suggestions)),
    synonyms: unique(results.flatMap((result) => result.synonyms)),
    synonymDetails: uniqueRelatedWords(
      results.flatMap((result) => result.synonymDetails),
    ),
    term: first?.term || term,
  }
}

function unique(values: readonly string[]) {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const key = value.toLocaleLowerCase("es")

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    result.push(value)
  }

  return result
}

function uniqueRelatedWords<T extends { word: string }>(values: readonly T[]) {
  const seen = new Set<string>()
  const result: T[] = []

  for (const value of values) {
    const key = value.word.toLocaleLowerCase("es")

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    result.push(value)
  }

  return result
}
