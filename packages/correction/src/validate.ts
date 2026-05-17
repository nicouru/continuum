import type { CorrectionModelResponse } from "./schema"

export function validateCorrectionModelResponse(
  value: unknown,
): CorrectionModelResponse {
  if (!value || typeof value !== "object") {
    throw new Error("La respuesta de corrección no es un objeto JSON.")
  }

  const record = value as Record<string, unknown>

  if (typeof record.corrected_text !== "string") {
    throw new Error("La respuesta de corrección no incluye corrected_text.")
  }

  if (!Array.isArray(record.warnings)) {
    throw new Error("La respuesta de corrección no incluye warnings.")
  }

  const warnings = record.warnings.map((item, index) => {
    if (typeof item !== "string") {
      throw new Error(`warnings[${index}] no es un string.`)
    }
    return item
  })

  return {
    corrected_text: record.corrected_text,
    warnings,
  }
}
