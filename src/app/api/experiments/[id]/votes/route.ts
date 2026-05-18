import { jsonError, jsonOk } from "@/lib/api";
import { upsertVote } from "@/lib/experiment-mutations";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      sessionId?: string;
      variantId?: string;
      textSampleId?: string;
      readability30m?: unknown;
      pretentiousness?: unknown;
      fontDominatesText?: unknown;
      comment?: string;
    };

    if (!body.sessionId || !body.variantId || !body.textSampleId) {
      throw new Error("sessionId, variantId y textSampleId son obligatorios.");
    }

    const experiment = await upsertVote(id, body.sessionId, {
      variantId: body.variantId,
      textSampleId: body.textSampleId,
      readability30m: body.readability30m,
      pretentiousness: body.pretentiousness,
      fontDominatesText: body.fontDominatesText,
      comment: body.comment,
    });

    return jsonOk(experiment);
  } catch (error) {
    return jsonError(error);
  }
}
