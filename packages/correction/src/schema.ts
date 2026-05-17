export const CORRECTION_RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["corrected_text", "warnings"],
  properties: {
    corrected_text: { type: "string" },
    warnings: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const

export type CorrectionModelResponse = {
  corrected_text: string
  warnings: string[]
}
