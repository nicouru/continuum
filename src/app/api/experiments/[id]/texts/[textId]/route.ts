import { jsonError, jsonOk } from "@/lib/api";
import { deleteText, updateText } from "@/lib/experiment-mutations";

interface Params {
  params: Promise<{ id: string; textId: string }>;
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id, textId } = await params;
    const body = (await request.json()) as { content?: string };
    const experiment = await updateText(id, textId, body.content ?? "");
    return jsonOk(experiment);
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id, textId } = await params;
    const experiment = await deleteText(id, textId);
    return jsonOk(experiment);
  } catch (error) {
    return jsonError(error);
  }
}
