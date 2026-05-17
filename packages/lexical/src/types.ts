export type LexicalLookupSource = {
  id: string
  label: string
  url?: string
}

export type LexicalRelatedWord = {
  label?: string
  word: string
}

export type LexicalDefinition = {
  category?: string
  description: string
  raw?: string
}

export type LexicalLocution = {
  definitions: LexicalDefinition[]
  expression: string
  synonyms: LexicalRelatedWord[]
  antonyms: LexicalRelatedWord[]
}

export type LexicalLookupResult = {
  antonyms: string[]
  antonymDetails: LexicalRelatedWord[]
  definitions: LexicalDefinition[]
  etymology: string | null
  locutions: LexicalLocution[]
  rawSenses: string[]
  source: LexicalLookupSource
  suggestions: string[]
  synonyms: string[]
  synonymDetails: LexicalRelatedWord[]
  term: string
}

export type LexicalProviderLookupOptions = {
  signal?: AbortSignal
}

export interface LexicalProvider {
  id: string
  lookup(
    term: string,
    options?: LexicalProviderLookupOptions,
  ): Promise<LexicalLookupResult>
}

export class LexicalLookupError extends Error {
  constructor(
    message: string,
    readonly providerId: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = "LexicalLookupError"
  }
}
