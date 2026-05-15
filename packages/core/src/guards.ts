export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`)
}

export function sameOrderedStrings(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}

export function getDuplicateIds(ids: readonly string[]) {
  const seen = new Set<string>()
  const duplicates = new Set<string>()

  for (const id of ids) {
    if (seen.has(id)) {
      duplicates.add(id)
    }

    seen.add(id)
  }

  return Array.from(duplicates)
}
