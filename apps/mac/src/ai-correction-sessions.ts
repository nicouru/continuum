import { load } from "@tauri-apps/plugin-store"
import {
  normalizeCorrectionSessionRecords,
  type CorrectionSessionRecord,
} from "@continuum/correction"

const STORE_PATH = "continuum-ai-correction-sessions.json"
const STORE_KEY = "sessions"

export async function readAiCorrectionSessions(): Promise<CorrectionSessionRecord[]> {
  const store = await load(STORE_PATH)
  return normalizeCorrectionSessionRecords(await store.get<unknown>(STORE_KEY))
}

export async function writeAiCorrectionSessions(
  sessions: readonly CorrectionSessionRecord[],
) {
  const store = await load(STORE_PATH)
  await store.set(STORE_KEY, sessions)
  await store.save()
}
