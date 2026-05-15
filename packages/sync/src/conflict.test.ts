import { describe, expect, it } from "vitest"
import { shouldFlagSyncConflict } from "./conflict"

describe("sync conflict detection", () => {
  it("flags when remote advanced and local edits are dirty", () => {
    expect(
      shouldFlagSyncConflict({
        serverRemoteVersion: 3,
        storedRemoteVersion: 2,
        syncState: "dirty",
      }),
    ).toBe(true)
  })

  it("ignores when remote matches stored", () => {
    expect(
      shouldFlagSyncConflict({
        serverRemoteVersion: 2,
        storedRemoteVersion: 2,
        syncState: "dirty",
      }),
    ).toBe(false)
  })

  it("ignores offline queue", () => {
    expect(
      shouldFlagSyncConflict({
        serverRemoteVersion: 9,
        storedRemoteVersion: 1,
        syncState: "offline",
      }),
    ).toBe(false)
  })
})
