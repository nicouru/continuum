import { promises as fs } from "fs";
import path from "path";
import { createBlindSession } from "./blind";
import { createId } from "./id";
import { createDemoExperiment } from "./seed";
import { totalVoteCount } from "./scoring";
import type { Experiment, ExperimentStatus } from "./types";
import { requireNonEmpty } from "./validation";

const DATA_DIR = path.join(process.cwd(), "data", "canon-lab");
const DATA_FILE = path.join(DATA_DIR, "experiments.json");

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function defaultCriteria(): Experiment["criteria"] {
  return {
    readability30m: "¿Lo leería 30 minutos?",
    pretentiousness: "¿La letra se siente pretenciosa?",
    fontDominatesText: "¿La letra habla más que el texto?",
  };
}

export async function loadExperiments(): Promise<Experiment[]> {
  await ensureDataDir();

  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      throw new Error("El archivo de experimentos debe ser un array JSON.");
    }

    return parsed as Experiment[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      const seeded = [createDemoExperiment()];
      await saveExperiments(seeded);
      return seeded;
    }

    if (error instanceof SyntaxError) {
      throw new Error(
        `JSON inválido en ${DATA_FILE}. Corregí el archivo o borralo para regenerar el seed.`,
      );
    }

    throw error;
  }
}

export async function saveExperiments(experiments: Experiment[]): Promise<void> {
  await ensureDataDir();
  const payload = `${JSON.stringify(experiments, null, 2)}\n`;
  const tempFile = `${DATA_FILE}.tmp`;
  await fs.writeFile(tempFile, payload, "utf8");
  await fs.rename(tempFile, DATA_FILE);
}

export async function getExperiment(id: string): Promise<Experiment | undefined> {
  const experiments = await loadExperiments();
  return experiments.find((experiment) => experiment.id === id);
}

export async function createExperiment(input: {
  title: string;
  description?: string;
}): Promise<Experiment> {
  const experiments = await loadExperiments();
  const now = new Date().toISOString();
  const experiment: Experiment = {
    id: createId(),
    title: requireNonEmpty(input.title, "Título"),
    description: input.description?.trim() ?? "",
    createdAt: now,
    updatedAt: now,
    status: "draft",
    criteria: defaultCriteria(),
    texts: [],
    variants: [],
    sessions: [],
  };

  experiments.push(experiment);
  await saveExperiments(experiments);
  return experiment;
}

export async function updateExperiment(
  id: string,
  updater: (experiment: Experiment) => Experiment,
): Promise<Experiment> {
  const experiments = await loadExperiments();
  const index = experiments.findIndex((experiment) => experiment.id === id);

  if (index === -1) {
    throw new Error("Experimento no encontrado.");
  }

  const updated = {
    ...updater(experiments[index]),
    updatedAt: new Date().toISOString(),
  };

  experiments[index] = updated;
  await saveExperiments(experiments);
  return updated;
}

export async function deleteExperiment(id: string): Promise<void> {
  const experiments = await loadExperiments();
  const next = experiments.filter((experiment) => experiment.id !== id);

  if (next.length === experiments.length) {
    throw new Error("Experimento no encontrado.");
  }

  await saveExperiments(next);
}

export async function startBlindSession(experimentId: string): Promise<Experiment> {
  return updateExperiment(experimentId, (experiment) => {
    assertNotFrozen(experiment);

    if (experiment.texts.length === 0) {
      throw new Error("Agregá al menos un texto antes de iniciar la comparación.");
    }

    if (experiment.variants.length < 2) {
      throw new Error("Agregá al menos dos variantes tipográficas.");
    }

    const open = experiment.sessions.find((session) => !session.completedAt);
    if (open) {
      throw new Error("Ya hay una sesión ciega abierta. Terminála antes de iniciar otra.");
    }

    const session = createBlindSession(experiment);

    return {
      ...experiment,
      status: "running" satisfies ExperimentStatus,
      sessions: [...experiment.sessions, session],
    };
  });
}

export async function freezeExperiment(
  experimentId: string,
  decisionNote?: string,
): Promise<Experiment> {
  return updateExperiment(experimentId, (experiment) => {
    if (totalVoteCount(experiment) === 0) {
      throw new Error("No podés congelar sin votos registrados.");
    }

    if (!experiment.winnerVariantId) {
      throw new Error("Elegí una variante ganadora antes de congelar.");
    }

    const freezeUntil = new Date();
    freezeUntil.setDate(freezeUntil.getDate() + 30);

    return {
      ...experiment,
      status: "frozen",
      freezeUntil: freezeUntil.toISOString(),
      decisionNote: decisionNote?.trim() || experiment.decisionNote,
    };
  });
}

export function assertNotFrozen(experiment: Experiment): void {
  if (experiment.status === "frozen") {
    const until = experiment.freezeUntil
      ? new Date(experiment.freezeUntil).toLocaleDateString("es-AR")
      : "fecha desconocida";
    throw new Error(`Experimento congelado hasta ${until}. No se puede modificar.`);
  }
}

