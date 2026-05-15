import { describe, expect, it } from "vitest"
import { getUniqueInputId, isRecord } from "./index"

describe("getUniqueInputId", () => {
  it("keeps stable ids when unused", () => {
    const used = new Set<string>()
    expect(getUniqueInputId({ fallback: "x", usedIds: used, value: "alpha" })).toBe(
      "alpha",
    )
  })

  it("allocates deterministic suffixes on collisions", () => {
    const used = new Set<string>(["dup"])
    expect(getUniqueInputId({ fallback: "x", usedIds: used, value: "dup" })).toBe(
      "dup-2",
    )
  })
})

describe("guards", () => {
  it("detects records", () => {
    expect(isRecord({})).toBe(true)
    expect(isRecord(null)).toBe(false)
  })
})
