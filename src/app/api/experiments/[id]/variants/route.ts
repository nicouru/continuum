import { jsonError, jsonOk } from "@/lib/api";
import { addVariant } from "@/lib/experiment-mutations";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const experiment = await addVariant(id, body);
    return jsonOk(experiment);
  } catch (error) {
    return jsonError(error);
  }
}
