import { jsonError, jsonOk } from "@/lib/api";
import { setWinner } from "@/lib/experiment-mutations";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      winnerVariantId?: string;
      decisionNote?: string;
    };

    if (!body.winnerVariantId) {
      throw new Error("winnerVariantId es obligatorio.");
    }

    const experiment = await setWinner(
      id,
      body.winnerVariantId,
      body.decisionNote,
    );

    return jsonOk(experiment);
  } catch (error) {
    return jsonError(error);
  }
}
