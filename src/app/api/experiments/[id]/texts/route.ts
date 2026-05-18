import { jsonError, jsonOk } from "@/lib/api";
import { addText } from "@/lib/experiment-mutations";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { content?: string };
    const experiment = await addText(id, body.content ?? "");
    return jsonOk(experiment);
  } catch (error) {
    return jsonError(error);
  }
}
