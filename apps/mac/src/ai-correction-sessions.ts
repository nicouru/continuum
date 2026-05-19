import { load } from "@tauri-apps/plugin-store"
import {
  normalizeCorrectionSessionRecords,
  type CorrectionSessionRecord,
} from "@continuum/correction"

const STORE_PATH = "continuum-ai-correction-sessions.json"
const STORE_KEY = "sessions"

const TTL_MS = 7 * 24 * 60 * 60 * 1000

export async function readAiCorrectionSessions(): Promise<CorrectionSessionRecord[]> {
  const store = await load(STORE_PATH)
  const allSessions = normalizeCorrectionSessionRecords(await store.get<unknown>(STORE_KEY))
  const now = Date.now()
  const validSessions = allSessions.filter((session) => {
    return session.updatedAt > 0 && now - session.updatedAt < TTL_MS
  })

  if (validSessions.length < allSessions.length) {
    await store.set(STORE_KEY, validSessions)
    await store.save()
  }

  return validSessions
}

export async function writeAiCorrectionSessions(
  sessions: readonly CorrectionSessionRecord[],
) {
  const store = await load(STORE_PATH)
  await store.set(STORE_KEY, sessions)
  await store.save()
}
