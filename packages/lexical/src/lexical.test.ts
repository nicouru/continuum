import { describe, expect, it } from "vitest"
import {
  normalizeSingleSelectedWord,
  parseRaeLexicalResponse,
  RaeLexicalProvider,
  type LexicalFetchLike,
} from "./index"

describe("normalizeSingleSelectedWord", () => {
  it("accepts one Spanish word and strips surrounding punctuation", () => {
    expect(normalizeSingleSelectedWord("claridad")).toBe("claridad")
    expect(normalizeSingleSelectedWord("método")).toBe("método")
    expect(normalizeSingleSelectedWord("“transparencia”")).toBe("transparencia")
    expect(normalizeSingleSelectedWord("cuerpo.")).toBe("cuerpo")
  })

  it("rejects empty selections, sentences, and non-word selections", () => {
    expect(normalizeSingleSelectedWord("")).toBeNull()
    expect(normalizeSingleSelectedWord("dos palabras")).toBeNull()
    expect(normalizeSingleSelectedWord("un\nparrafo")).toBeNull()
    expect(normalizeSingleSelectedWord("$...$")).toBeNull()
  })
})

describe("parseRaeLexicalResponse", () => {
  it("extracts etymology, synonyms, and antonyms from RAE API data", () => {
    const result = parseRaeLexicalResponse("claridad", {
      ok: true,
      data: {
        word: "claridad",
        meanings: [
          {
            origin: { raw: "Del lat. clarĭtas, -ātis." },
            senses: [
              {
                synonyms_v2: [{ word: "transparencia" }, { word: "limpieza" }],
                antonyms_v2: [{ word: "opacidad" }],
                description: "Cualidad de claro",
                raw: "1. f. Cualidad de claro.Sin.:transparencia.Ant.:opacidad.",
              },
              {
                synonyms: ["limpieza", "nitidez"],
                antonyms: ["oscuridad"],
                description: "Efecto que causa la luz iluminando un espacio",
              },
            ],
            locutions: [
              {
                expression: "con claridad",
                senses: [
                  {
                    description: "De forma clara",
                    synonyms: ["claramente"],
                  },
                ],
              },
            ],
          },
        ],
      },
    })

    expect(result.etymology).toBe("Del lat. clarĭtas, -ātis.")
    expect(result.synonyms).toEqual(["transparencia", "limpieza", "nitidez"])
    expect(result.antonyms).toEqual(["opacidad", "oscuridad"])
    expect(result.definitions.map((definition) => definition.description)).toEqual([
      "Cualidad de claro",
      "Efecto que causa la luz iluminando un espacio",
    ])
    expect(result.rawSenses).toEqual([
      "1. f. Cualidad de claro.Sin.:transparencia.Ant.:opacidad.",
    ])
    expect(result.locutions[0]).toMatchObject({
      expression: "con claridad",
      synonyms: [{ word: "claramente" }],
    })
    expect(result.source.id).toBe("rae")
  })

  it("returns an empty result for missing words without inventing data", () => {
    const result = parseRaeLexicalResponse("xxyz", {
      error: "NOT_FOUND",
      ok: false,
      suggestions: null,
    })

    expect(result.etymology).toBeNull()
    expect(result.synonyms).toEqual([])
    expect(result.antonyms).toEqual([])
    expect(result.definitions).toEqual([])
  })
})

describe("RaeLexicalProvider", () => {
  it("queries RAE API through an injected fetch implementation", async () => {
    const calls: string[] = []
    const fetchImpl: LexicalFetchLike = async (url) => {
      calls.push(url)
      return {
        json: async () => ({
          ok: true,
          data: {
            word: "método",
            meanings: [
              {
                origin: {
                  raw: "Del lat. methŏdus, y este del gr. μέθοδος méthodos.",
                },
                senses: [{ synonyms: ["sistema"], antonyms: ["desorden"] }],
              },
            ],
          },
        }),
        ok: true,
        status: 200,
        text: async () => "",
      }
    }

    const provider = new RaeLexicalProvider({
      apiKey: "test-key",
      fetchImpl,
    })
    const result = await provider.lookup("método")

    expect(calls[0]).toContain("/m%C3%A9todo")
    expect(calls[0]).toContain("api_key=test-key")
    expect(result.synonyms).toEqual(["sistema"])
    expect(result.antonyms).toEqual(["desorden"])
  })
})
