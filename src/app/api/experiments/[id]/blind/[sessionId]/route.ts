import { jsonError, jsonOk } from "@/lib/api";
import { completeBlindSession } from "@/lib/experiment-mutations";

interface Params {
  params: Promise<{ id: string; sessionId: string }>;
}

export async function POST(_request: Request, { params }: Params) {
  try {
    const { id, sessionId } = await params;
    const experiment = await completeBlindSession(id, sessionId);
    return jsonOk(experiment);
  } catch (error) {
    return jsonError(error);
  }
}
