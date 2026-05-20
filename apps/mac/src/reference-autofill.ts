import type { StructuredNoteDraftReference, TextDocument } from "@continuum/core"

export type ReferenceAutocompleteInput = {
  author: string
  authorBirthYear: string
  authorDeathYear: string
  body: string
  comment: string
  edition: string
  sourceText: string
  translator: string
  work: string
  workDate: string
}

type ReferenceTextField = "author" | "body" | "work"

export function getReferenceSuggestionValues(
  references: readonly StructuredNoteDraftReference[],
  field: ReferenceTextField,
) {
  return [
    ...new Set(
      references
        .map((reference) => reference[field]?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort((a, b) => a.localeCompare(b))
}

export function applyReferenceAuthorSuggestion(
  input: ReferenceAutocompleteInput,
  references: readonly StructuredNoteDraftReference[],
  author: string,
): ReferenceAutocompleteInput {
  const matches = references.filter((reference) =>
    sameSuggestionValue(reference.author, author),
  )
  const first = matches[0]
  const uniqueWork = getUniqueValue(matches.map((reference) => reference.work))

  return {
    ...input,
    author,
    ...(first
      ? {
          authorBirthYear: referenceYearToInput(
            first.authorBirthYear,
            input.authorBirthYear,
          ),
          authorDeathYear: referenceYearToInput(
            first.authorDeathYear,
            input.authorDeathYear,
          ),
          ...(uniqueWork ? { work: uniqueWork } : {}),
        }
      : {}),
  }
}

export function applyReferenceWorkSuggestion(
  input: ReferenceAutocompleteInput,
  references: readonly StructuredNoteDraftReference[],
  work: string,
): ReferenceAutocompleteInput {
  const matches = references.filter((reference) => sameSuggestionValue(reference.work, work))
  const first = matches[0]
  const uniqueAuthor = getUniqueValue(matches.map((reference) => reference.author))

  return {
    ...input,
    work,
    ...(first && uniqueAuthor
      ? {
          author: uniqueAuthor,
          authorBirthYear: referenceYearToInput(
            first.authorBirthYear,
            input.authorBirthYear,
          ),
          authorDeathYear: referenceYearToInput(
            first.authorDeathYear,
            input.authorDeathYear,
          ),
        }
      : {}),
  }
}

export function applyReferenceBodySuggestion(
  input: ReferenceAutocompleteInput,
  references: readonly StructuredNoteDraftReference[],
  body: string,
): ReferenceAutocompleteInput {
  const match = references.find((reference) => sameSuggestionValue(reference.body, body))

  if (!match) {
    return { ...input, body }
  }

  return fillReferenceInputFromReference(input, match, { body })
}

function fillReferenceInputFromReference(
  input: ReferenceAutocompleteInput,
  reference: StructuredNoteDraftReference,
  overrides: Partial<ReferenceAutocompleteInput> = {},
): ReferenceAutocompleteInput {
  return {
    ...input,
    author: reference.author ?? input.author,
    authorBirthYear: referenceYearToInput(reference.authorBirthYear, input.authorBirthYear),
    authorDeathYear: referenceYearToInput(reference.authorDeathYear, input.authorDeathYear),
    body: reference.body,
    comment: textDocumentToTextarea(reference.comment) ?? input.comment,
    edition: reference.edition ?? input.edition,
    sourceText: textDocumentToTextarea(reference.sourceText) ?? input.sourceText,
    translator: reference.translator ?? input.translator,
    work: reference.work ?? input.work,
    workDate: reference.workDate ?? input.workDate,
    ...overrides,
  }
}

function textDocumentToTextarea(document: TextDocument | undefined) {
  const paragraphs = document?.blocks
    .map((block) => block.text.trim())
    .filter(Boolean)

  return paragraphs?.length ? paragraphs.join("\n\n") : undefined
}

function getUniqueValue(values: readonly (string | undefined)[]) {
  const uniqueValues = [
    ...new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ]
  return uniqueValues.length === 1 ? uniqueValues[0] : undefined
}

function referenceYearToInput(value: number | undefined, fallback: string) {
  return value === undefined ? fallback : value.toString()
}

function sameSuggestionValue(left: string | undefined, right: string) {
  return (
    left?.trim().localeCompare(right.trim(), undefined, { sensitivity: "base" }) === 0
  )
}
