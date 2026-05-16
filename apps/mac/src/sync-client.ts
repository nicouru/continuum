import { fetch as tauriFetch } from "@tauri-apps/plugin-http"
import {
  DiarioDraftHttpRemoteClient,
  MockDraftRemoteClient,
  type DraftRemoteClient,
  type FetchLike,
} from "@continuum/sync"
import type { DiarioAuthSession } from "./auth"

export type ContinuumSyncClient = {
  client: DraftRemoteClient
  label: string
  mode: "http" | "mock"
}

export function createContinuumSyncClient(
  session: DiarioAuthSession | null,
): ContinuumSyncClient {
  const envCookie = import.meta.env.VITE_DIARIO_ADMIN_SESSION_COOKIE?.trim()
  const baseUrl = session?.baseUrl || import.meta.env.VITE_DIARIO_ADMIN_BASE_URL?.trim()
  const sessionCookie = session?.sessionCookie || envCookie

  if (!baseUrl || !sessionCookie) {
    return createMockSyncClient("login requerido")
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
      sessionCookie,
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
