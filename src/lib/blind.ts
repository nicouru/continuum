import { createId } from "./id";
import type { BlindSession, Experiment } from "./types";

const LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function createBlindSession(experiment: Experiment): BlindSession {
  const variantOrder = shuffle(experiment.variants.map((variant) => variant.id));
  const labelByVariantId: Record<string, string> = {};

  variantOrder.forEach((variantId, index) => {
    labelByVariantId[variantId] = `Variante ${LABELS[index] ?? String(index + 1)}`;
  });

  return {
    id: createId(),
    experimentId: experiment.id,
    createdAt: new Date().toISOString(),
    revealed: false,
    variantOrder,
    labelByVariantId,
    votes: [],
  };
}

export function activeBlindSession(
  experiment: Experiment,
): BlindSession | undefined {
  return experiment.sessions.find((session) => !session.completedAt);
}
