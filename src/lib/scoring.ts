import type { Experiment, TypographyVariant, VariantRanking, Vote } from "./types";

export function voteScore(vote: Pick<
  Vote,
  "readability30m" | "pretentiousness" | "fontDominatesText"
>): number {
  return (
    vote.readability30m -
    vote.pretentiousness * 0.65 -
    vote.fontDominatesText * 0.8
  );
}

export function collectVotes(experiment: Experiment): Vote[] {
  return experiment.sessions.flatMap((session) => session.votes);
}

export function rankVariants(experiment: Experiment): VariantRanking[] {
  const votes = collectVotes(experiment);
  const byVariant = new Map<string, Vote[]>();

  for (const vote of votes) {
    const list = byVariant.get(vote.variantId) ?? [];
    list.push(vote);
    byVariant.set(vote.variantId, list);
  }

  const rankings: VariantRanking[] = experiment.variants.map((variant) => {
    const variantVotes = byVariant.get(variant.id) ?? [];
    const voteCount = variantVotes.length;

    if (voteCount === 0) {
      return {
        variantId: variant.id,
        label: variant.label,
        voteCount: 0,
        avgReadability30m: 0,
        avgPretentiousness: 0,
        avgFontDominatesText: 0,
        avgScore: 0,
        variant,
      };
    }

    const totals = variantVotes.reduce(
      (acc, vote) => ({
        readability30m: acc.readability30m + vote.readability30m,
        pretentiousness: acc.pretentiousness + vote.pretentiousness,
        fontDominatesText: acc.fontDominatesText + vote.fontDominatesText,
        score: acc.score + voteScore(vote),
      }),
      {
        readability30m: 0,
        pretentiousness: 0,
        fontDominatesText: 0,
        score: 0,
      },
    );

    return {
      variantId: variant.id,
      label: variant.label,
      voteCount,
      avgReadability30m: totals.readability30m / voteCount,
      avgPretentiousness: totals.pretentiousness / voteCount,
      avgFontDominatesText: totals.fontDominatesText / voteCount,
      avgScore: totals.score / voteCount,
      variant,
    };
  });

  return rankings.sort((a, b) => {
    if (b.avgScore !== a.avgScore) {
      return b.avgScore - a.avgScore;
    }
    return b.voteCount - a.voteCount;
  });
}

export function totalVoteCount(experiment: Experiment): number {
  return collectVotes(experiment).length;
}

export function expectedVoteCount(experiment: Experiment): number {
  return experiment.texts.length * experiment.variants.length;
}

export function sessionExpectedVoteCount(experiment: Experiment): number {
  return expectedVoteCount(experiment);
}

export function sessionVoteCount(session: Experiment["sessions"][number]): number {
  return session.votes.length;
}

export function isSessionComplete(
  experiment: Experiment,
  session: Experiment["sessions"][number],
): boolean {
  return sessionVoteCount(session) >= sessionExpectedVoteCount(experiment);
}

export function findVariant(
  experiment: Experiment,
  variantId: string,
): TypographyVariant | undefined {
  return experiment.variants.find((variant) => variant.id === variantId);
}
