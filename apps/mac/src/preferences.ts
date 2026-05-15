import { load } from "@tauri-apps/plugin-store"

const STORE_PATH = "continuum-preferences.json"

export type ContinuumPreferences = {
  sidebarVisible: boolean
  lastOpenedNoteId: string | null
}

export async function readPreferences(): Promise<ContinuumPreferences> {
  const store = await load(STORE_PATH)
  const sidebarVisible = await store.get<boolean>("sidebarVisible")
  const lastOpenedNoteId = await store.get<string>("lastOpenedNoteId")
  return {
    sidebarVisible: sidebarVisible ?? true,
    lastOpenedNoteId: lastOpenedNoteId ?? null,
  }
}

export async function writePreferences(partial: Partial<ContinuumPreferences>) {
  const store = await load(STORE_PATH)
  if (partial.sidebarVisible !== undefined) {
    await store.set("sidebarVisible", partial.sidebarVisible)
  }
  if (partial.lastOpenedNoteId !== undefined) {
    await store.set("lastOpenedNoteId", partial.lastOpenedNoteId)
  }
  await store.save()
}
