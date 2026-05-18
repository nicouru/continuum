import { createId } from "./id";
import {
  assertNotFrozen,
  getExperiment,
  updateExperiment,
} from "./repository";
import { sessionExpectedVoteCount, totalVoteCount } from "./scoring";
import type {
  Experiment,
  TextSample,
  TypographyVariant,
  Vote,
} from "./types";
import { parsePositiveNumber, parseRating, requireNonEmpty } from "./validation";

function touch(experiment: Experiment): Experiment {
  return { ...experiment, updatedAt: new Date().toISOString() };
}

export async function addText(
  experimentId: string,
  content: string,
): Promise<Experiment> {
  return updateExperiment(experimentId, (experiment) => {
    assertNotFrozen(experiment);
    const text: TextSample = {
      id: createId(),
      content: requireNonEmpty(content, "Texto"),
      createdAt: new Date().toISOString(),
    };
    return touch({ ...experiment, texts: [...experiment.texts, text] });
  });
}

export async function updateText(
  experimentId: string,
  textId: string,
  content: string,
): Promise<Experiment> {
  return updateExperiment(experimentId, (experiment) => {
    assertNotFrozen(experiment);
    return touch({
      ...experiment,
      texts: experiment.texts.map((text) =>
        text.id === textId
          ? { ...text, content: requireNonEmpty(content, "Texto") }
          : text,
      ),
    });
  });
}

export async function deleteText(
  experimentId: string,
  textId: string,
): Promise<Experiment> {
  return updateExperiment(experimentId, (experiment) => {
    assertNotFrozen(experiment);
    return touch({
      ...experiment,
      texts: experiment.texts.filter((text) => text.id !== textId),
      sessions: experiment.sessions.map((session) => ({
        ...session,
        votes: session.votes.filter((vote) => vote.textSampleId !== textId),
      })),
    });
  });
}

export function parseVariantInput(
  input: Record<string, unknown>,
): Omit<TypographyVariant, "id"> {
  return {
    label: requireNonEmpty(String(input.label ?? ""), "Etiqueta"),
    fontFamily: requireNonEmpty(String(input.fontFamily ?? ""), "fontFamily"),
    fontImportUrl: input.fontImportUrl
      ? String(input.fontImportUrl).trim()
      : undefined,
    fontWeight: parsePositiveNumber(input.fontWeight, "fontWeight"),
    fontSizeRem: parsePositiveNumber(input.fontSizeRem, "fontSizeRem"),
    lineHeight: parsePositiveNumber(input.lineHeight, "lineHeight"),
    letterSpacingEm: Number(input.letterSpacingEm ?? 0),
    wordSpacingEm: Number(input.wordSpacingEm ?? 0),
    maxWidthRem: parsePositiveNumber(input.maxWidthRem, "maxWidthRem"),
    color: requireNonEmpty(String(input.color ?? ""), "color"),
    fontVariationSettings: input.fontVariationSettings
      ? String(input.fontVariationSettings).trim()
      : undefined,
    notes: input.notes ? String(input.notes).trim() : undefined,
  };
}

export async function addVariant(
  experimentId: string,
  input: Record<string, unknown>,
): Promise<Experiment> {
  return updateExperiment(experimentId, (experiment) => {
    assertNotFrozen(experiment);
    const variant: TypographyVariant = {
      id: createId(),
      ...parseVariantInput(input),
    };
    return touch({ ...experiment, variants: [...experiment.variants, variant] });
  });
}

export async function updateVariant(
  experimentId: string,
  variantId: string,
  input: Record<string, unknown>,
): Promise<Experiment> {
  return updateExperiment(experimentId, (experiment) => {
    assertNotFrozen(experiment);
    return touch({
      ...experiment,
      variants: experiment.variants.map((variant) =>
        variant.id === variantId
          ? { id: variantId, ...parseVariantInput(input) }
          : variant,
      ),
    });
  });
}

export async function deleteVariant(
  experimentId: string,
  variantId: string,
): Promise<Experiment> {
  return updateExperiment(experimentId, (experiment) => {
    assertNotFrozen(experiment);
    return touch({
      ...experiment,
      variants: experiment.variants.filter((variant) => variant.id !== variantId),
      winnerVariantId:
        experiment.winnerVariantId === variantId
          ? undefined
          : experiment.winnerVariantId,
      sessions: experiment.sessions.map((session) => ({
        ...session,
        votes: session.votes.filter((vote) => vote.variantId !== variantId),
        variantOrder: session.variantOrder.filter((id) => id !== variantId),
      })),
    });
  });
}

export async function upsertVote(
  experimentId: string,
  sessionId: string,
  input: {
    variantId: string;
    textSampleId: string;
    readability30m: unknown;
    pretentiousness: unknown;
    fontDominatesText: unknown;
    comment?: string;
  },
): Promise<Experiment> {
  return updateExperiment(experimentId, (experiment) => {
    assertNotFrozen(experiment);
    const session = experiment.sessions.find((item) => item.id === sessionId);

    if (!session || session.completedAt) {
      throw new Error("Sesión ciega no encontrada o ya finalizada.");
    }

    if (session.revealed) {
      throw new Error("La sesión ya fue revelada.");
    }

    const vote: Vote = {
      id: createId(),
      variantId: input.variantId,
      textSampleId: input.textSampleId,
      sessionId,
      readability30m: parseRating(input.readability30m, "Legibilidad 30 min"),
      pretentiousness: parseRating(input.pretentiousness, "Pretenciosidad"),
      fontDominatesText: parseRating(
        input.fontDominatesText,
        "La letra domina el texto",
      ),
      comment: input.comment?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    const withoutDuplicate = session.votes.filter(
      (existing) =>
        !(
          existing.variantId === vote.variantId &&
          existing.textSampleId === vote.textSampleId
        ),
    );

    const sessions = experiment.sessions.map((item) =>
      item.id === sessionId
        ? { ...item, votes: [...withoutDuplicate, vote] }
        : item,
    );

    return touch({ ...experiment, sessions });
  });
}

export async function completeBlindSession(
  experimentId: string,
  sessionId: string,
): Promise<Experiment> {
  const experiment = await getExperiment(experimentId);

  if (!experiment) {
    throw new Error("Experimento no encontrado.");
  }

  const session = experiment.sessions.find((item) => item.id === sessionId);

  if (!session) {
    throw new Error("Sesión no encontrada.");
  }

  if (session.completedAt) {
    throw new Error("La sesión ya está terminada.");
  }

  const required = sessionExpectedVoteCount(experiment);

  if (session.votes.length < required) {
    throw new Error(
      `Faltan votos obligatorios (${session.votes.length}/${required}). Completá todas las combinaciones texto × variante.`,
    );
  }

  return updateExperiment(experimentId, (current) => ({
    ...current,
    sessions: current.sessions.map((item) =>
      item.id === sessionId
        ? {
            ...item,
            revealed: true,
            completedAt: new Date().toISOString(),
          }
        : item,
    ),
  }));
}

export async function setWinner(
  experimentId: string,
  winnerVariantId: string,
  decisionNote?: string,
): Promise<Experiment> {
  return updateExperiment(experimentId, (experiment) => {
    assertNotFrozen(experiment);

    if (totalVoteCount(experiment) === 0) {
      throw new Error("No hay votos para elegir ganadora.");
    }

    const exists = experiment.variants.some(
      (variant) => variant.id === winnerVariantId,
    );

    if (!exists) {
      throw new Error("Variante ganadora inválida.");
    }

    return touch({
      ...experiment,
      winnerVariantId,
      decisionNote: decisionNote?.trim() || experiment.decisionNote,
    });
  });
}
