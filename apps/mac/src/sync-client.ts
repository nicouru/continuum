import { fetch as tauriFetch } from "@tauri-apps/plugin-http"
import {
  DiarioDraftHttpRemoteClient,
  MockDraftRemoteClient,
  type DraftRemoteClient,
  type FetchLike,
} from "@continuum/sync"

export type ContinuumSyncClient = {
  client: DraftRemoteClient
  label: string
  mode: "http" | "mock"
}

export function createContinuumSyncClient(): ContinuumSyncClient {
  const baseUrl = import.meta.env.VITE_DIARIO_ADMIN_BASE_URL?.trim()

  if (!baseUrl) {
    return createMockSyncClient()
  }

  let origin: string

  try {
    origin = new URL(baseUrl).origin
  } catch {
    return createMockSyncClient("mock: invalid sync URL")
  }

  return {
    client: new DiarioDraftHttpRemoteClient({
      baseUrl,
      bearerToken: import.meta.env.VITE_DIARIO_ADMIN_BEARER_TOKEN?.trim(),
      fetchImpl: tauriFetch as FetchLike,
      origin,
      sessionCookie: import.meta.env.VITE_DIARIO_ADMIN_SESSION_COOKIE?.trim(),
    }),
    label: origin,
    mode: "http",
  }
}

function createMockSyncClient(label = "mock"): ContinuumSyncClient {
  return {
    client: new MockDraftRemoteClient(),
    label,
    mode: "mock",
  }
}
