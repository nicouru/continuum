import { jsonError, jsonOk } from "@/lib/api";
import { startBlindSession } from "@/lib/repository";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const experiment = await startBlindSession(id);
    return jsonOk(experiment, 201);
  } catch (error) {
    return jsonError(error);
  }
}
