import { fetch as tauriFetch } from "@tauri-apps/plugin-http"
import {
  createLexicalProviderChain,
  RaeLexicalProvider,
  type LexicalFetchLike,
  type LexicalProvider,
} from "@continuum/lexical"

export function createContinuumLexicalProvider(): LexicalProvider {
  return createLexicalProviderChain([
    new RaeLexicalProvider({
      apiKey: import.meta.env.VITE_RAE_API_KEY?.trim(),
      fetchImpl: tauriFetch as LexicalFetchLike,
    }),
  ])
}
