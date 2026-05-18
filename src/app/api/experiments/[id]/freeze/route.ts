import { jsonError, jsonOk } from "@/lib/api";
import { freezeExperiment } from "@/lib/repository";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { decisionNote?: string };
    const experiment = await freezeExperiment(id, body.decisionNote);
    return jsonOk(experiment);
  } catch (error) {
    return jsonError(error);
  }
}
