import { load } from "@tauri-apps/plugin-store"

const STORE_PATH = "continuum-preferences.json"

export type ContinuumPreferences = {
  sidebarVisible: boolean
  sidebarWidth: number
  lastOpenedNoteId: string | null
}

export async function readPreferences(): Promise<ContinuumPreferences> {
  const store = await load(STORE_PATH)
  const sidebarVisible = await store.get<boolean>("sidebarVisible")
  const sidebarWidth = await store.get<number>("sidebarWidth")
  const lastOpenedNoteId = await store.get<string>("lastOpenedNoteId")
  return {
    sidebarVisible: sidebarVisible ?? true,
    sidebarWidth: sidebarWidth ?? 320,
    lastOpenedNoteId: lastOpenedNoteId ?? null,
  }
}

export async function writePreferences(partial: Partial<ContinuumPreferences>) {
  const store = await load(STORE_PATH)
  if (partial.sidebarVisible !== undefined) {
    await store.set("sidebarVisible", partial.sidebarVisible)
  }
  if (partial.sidebarWidth !== undefined) {
    await store.set("sidebarWidth", partial.sidebarWidth)
  }
  if (partial.lastOpenedNoteId !== undefined) {
    await store.set("lastOpenedNoteId", partial.lastOpenedNoteId)
  }
  await store.save()
}
