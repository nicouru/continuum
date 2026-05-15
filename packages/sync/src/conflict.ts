import type { NoteSyncState } from "@continuum/storage/types"

export type ConflictEvaluationInput = {
  /** Last remote generation accepted locally (SQLite `remote_version`). */
  storedRemoteVersion: number
  /** Current remote generation reported by API. */
  serverRemoteVersion: number
  syncState: NoteSyncState
}

/**
 * MVP rule: if the server moved forward beyond what we last integrated,
 * and we still have unpushed local edits, surface a conflict instead of overwriting.
 */
export function shouldFlagSyncConflict(input: ConflictEvaluationInput): boolean {
  if (input.syncState === "offline") {
    return false
  }

  if (input.serverRemoteVersion <= input.storedRemoteVersion) {
    return false
  }

  return (
    input.syncState === "dirty" ||
    input.syncState === "syncing" ||
    input.syncState === "error"
  )
}
