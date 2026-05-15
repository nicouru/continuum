import type {
  TextDocument,
} from "../domain-types"
export { isRecord, assertNever } from "../guards"
export {
  formatDateInput as toStructuredDraftDateInput,
  formatIdTimestamp as toStructuredDraftTimestampId,
} from "../dates"

export function getNonEmptyString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback
}

export function getUniqueInputId({
  fallback,
  usedIds,
  value,
}: {
  fallback: string
  usedIds: Set<string>
  value: unknown
}) {
  const base = getNonEmptyString(value, fallback)

  if (!usedIds.has(base)) {
    usedIds.add(base)
    return base
  }

  let suffix = 2
  let candidate = `${base}-${suffix}`

  while (usedIds.has(candidate)) {
    suffix += 1
    candidate = `${base}-${suffix}`
  }

  usedIds.add(candidate)
  return candidate
}

export function createTextDocument(id: string, text: string): TextDocument {
  return {
    blocks: [
      {
        id,
        text,
        type: "paragraph",
      },
    ],
  }
}
