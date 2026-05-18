import { describe, expect, it } from "vitest";
import { rankVariants, voteScore } from "./scoring";
import type { Experiment } from "./types";

describe("voteScore", () => {
  it("applies the Canon Lab formula", () => {
    expect(
      voteScore({
        readability30m: 5,
        pretentiousness: 2,
        fontDominatesText: 1,
      }),
    ).toBeCloseTo(5 - 2 * 0.65 - 1 * 0.8);
  });
});

describe("rankVariants", () => {
  it("orders variants by average score", () => {
    const experiment = {
      variants: [
        {
          id: "a",
          label: "A",
          fontFamily: "A",
          fontWeight: 400,
          fontSizeRem: 1,
          lineHeight: 1.5,
          letterSpacingEm: 0,
          wordSpacingEm: 0,
          maxWidthRem: 40,
          color: "#000",
        },
        {
          id: "b",
          label: "B",
          fontFamily: "B",
          fontWeight: 400,
          fontSizeRem: 1,
          lineHeight: 1.5,
          letterSpacingEm: 0,
          wordSpacingEm: 0,
          maxWidthRem: 40,
          color: "#000",
        },
      ],
      sessions: [
        {
          id: "s1",
          experimentId: "e1",
          createdAt: "2026-01-01",
          revealed: true,
          variantOrder: ["a", "b"],
          labelByVariantId: { a: "A", b: "B" },
          votes: [
            {
              id: "v1",
              variantId: "a",
              textSampleId: "t1",
              sessionId: "s1",
              readability30m: 5,
              pretentiousness: 1,
              fontDominatesText: 1,
              createdAt: "2026-01-01",
            },
            {
              id: "v2",
              variantId: "b",
              textSampleId: "t1",
              sessionId: "s1",
              readability30m: 2,
              pretentiousness: 5,
              fontDominatesText: 5,
              createdAt: "2026-01-01",
            },
          ],
        },
      ],
    } as unknown as Experiment;

    const ranking = rankVariants(experiment);
    expect(ranking[0]?.variantId).toBe("a");
    expect(ranking[1]?.variantId).toBe("b");
  });
});
