import {
  BaseDirectory,
  exists,
  readTextFile,
  remove,
  writeTextFile,
} from "@tauri-apps/plugin-fs"
import type { ContinuumEditorPayload } from "@continuum/editor"

const RELATIVE_PATH = "continuum/emergency-draft.json"

export type EmergencyDraftFile = {
  noteId: string
  savedAtMs: number
  localVersion: number
  structuredDraft: ContinuumEditorPayload["structuredDraft"]
  tiptapJson: ContinuumEditorPayload["tiptapJson"]
}

export async function writeEmergencyDraft(payload: EmergencyDraftFile) {
  await writeTextFile(RELATIVE_PATH, JSON.stringify(payload), {
    baseDir: BaseDirectory.AppLocalData,
  })
}

export async function clearEmergencyDraft() {
  const present = await exists(RELATIVE_PATH, { baseDir: BaseDirectory.AppLocalData })
  if (!present) {
    return
  }
  await remove(RELATIVE_PATH, { baseDir: BaseDirectory.AppLocalData })
}

export async function readEmergencyDraft(): Promise<EmergencyDraftFile | null> {
  const present = await exists(RELATIVE_PATH, { baseDir: BaseDirectory.AppLocalData })
  if (!present) {
    return null
  }
  const raw = await readTextFile(RELATIVE_PATH, { baseDir: BaseDirectory.AppLocalData })
  return JSON.parse(raw) as EmergencyDraftFile
}
