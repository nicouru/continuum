import { describe, expect, it } from "vitest"
import type { StructuredNoteDraftReference } from "@continuum/core"
import {
  applyReferenceAuthorSuggestion,
  applyReferenceBodySuggestion,
  applyReferenceWorkSuggestion,
  getReferenceSuggestionValues,
  type ReferenceAutocompleteInput,
} from "./reference-autofill"

const emptyInput: ReferenceAutocompleteInput = {
  author: "",
  authorBirthYear: "",
  authorDeathYear: "",
  body: "",
  comment: "",
  edition: "",
  sourceText: "",
  translator: "",
  work: "",
  workDate: "",
}

const references: StructuredNoteDraftReference[] = [
  {
    author: "Simone Weil",
    authorBirthYear: 1909,
    authorDeathYear: 1943,
    body: "La atencion es la forma mas rara y pura de la generosidad.",
    edition: "Trotta",
    id: "ref-weil",
    sourceText: {
      blocks: [
        {
          id: "source-1",
          text: "Espera de Dios",
          type: "paragraph",
        },
      ],
    },
    translator: "Maria Tabuyo",
    work: "A la espera de Dios",
    workDate: "1950",
  },
  {
    author: "Walter Benjamin",
    body: "No hay documento de cultura que no lo sea tambien de barbarie.",
    id: "ref-benjamin",
    work: "Tesis sobre la historia",
  },
  {
    author: "Walter Benjamin",
    body: "El narrador toma lo que narra de la experiencia.",
    id: "ref-benjamin-2",
    work: "El narrador",
  },
]

describe("reference autocomplete", () => {
  it("builds unique suggestion values for each field", () => {
    expect(getReferenceSuggestionValues(references, "author")).toEqual([
      "Simone Weil",
      "Walter Benjamin",
    ])
    expect(getReferenceSuggestionValues(references, "work")).toContain("A la espera de Dios")
    expect(getReferenceSuggestionValues(references, "body")).toContain(
      "La atencion es la forma mas rara y pura de la generosidad.",
    )
  })

  it("fills work and author dates when an author has one known work", () => {
    expect(applyReferenceAuthorSuggestion(emptyInput, references, "Simone Weil")).toMatchObject({
      author: "Simone Weil",
      authorBirthYear: "1909",
      authorDeathYear: "1943",
      work: "A la espera de Dios",
    })
  })

  it("does not guess a work when the author has multiple known works", () => {
    expect(
      applyReferenceAuthorSuggestion(emptyInput, references, "Walter Benjamin"),
    ).toMatchObject({
      author: "Walter Benjamin",
      work: "",
    })
  })

  it("fills the unique author when a known work is selected", () => {
    expect(applyReferenceWorkSuggestion(emptyInput, references, "El narrador")).toMatchObject({
      author: "Walter Benjamin",
      work: "El narrador",
    })
  })

  it("fills bibliographic fields when a known reference text is selected", () => {
    expect(
      applyReferenceBodySuggestion(
        emptyInput,
        references,
        "La atencion es la forma mas rara y pura de la generosidad.",
      ),
    ).toMatchObject({
      author: "Simone Weil",
      authorBirthYear: "1909",
      authorDeathYear: "1943",
      body: "La atencion es la forma mas rara y pura de la generosidad.",
      edition: "Trotta",
      sourceText: "Espera de Dios",
      translator: "Maria Tabuyo",
      work: "A la espera de Dios",
      workDate: "1950",
    })
  })
})
