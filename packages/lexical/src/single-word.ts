const OUTER_PUNCTUATION_RE =
  /^[\s¿¡"'“”‘’«»()[\]{}.,;:!?…]+|[\s¿¡"'“”‘’«»()[\]{}.,;:!?…]+$/gu
const SINGLE_WORD_RE = /^[\p{L}\p{M}]+(?:[-’'][\p{L}\p{M}]+)*$/u

export function normalizeSingleSelectedWord(selection: string): string | null {
  const trimmed = selection.trim()

  if (!trimmed || /\s/u.test(trimmed)) {
    return null
  }

  const stripped = trimmed.replace(OUTER_PUNCTUATION_RE, "").normalize("NFC")

  if (!stripped || /\s/u.test(stripped) || !SINGLE_WORD_RE.test(stripped)) {
    return null
  }

  return stripped.toLocaleLowerCase("es")
}
