import { jsonError, jsonOk } from "@/lib/api";
import {
  assertNotFrozen,
  deleteExperiment,
  getExperiment,
  updateExperiment,
} from "@/lib/repository";
import { requireNonEmpty } from "@/lib/validation";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const experiment = await getExperiment(id);

    if (!experiment) {
      return jsonError(new Error("Experimento no encontrado."), 404);
    }

    return jsonOk(experiment);
  } catch (error) {
    return jsonError(error, 500);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      title?: string;
      description?: string;
    };

    const experiment = await updateExperiment(id, (current) => {
      assertNotFrozen(current);
      return {
        ...current,
        title: body.title ? requireNonEmpty(body.title, "Título") : current.title,
        description:
          body.description !== undefined
            ? body.description.trim()
            : current.description,
      };
    });

    return jsonOk(experiment);
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    await deleteExperiment(id);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
