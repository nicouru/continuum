import { jsonError, jsonOk } from "@/lib/api";
import { deleteVariant, updateVariant } from "@/lib/experiment-mutations";

interface Params {
  params: Promise<{ id: string; variantId: string }>;
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id, variantId } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const experiment = await updateVariant(id, variantId, body);
    return jsonOk(experiment);
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { id, variantId } = await params;
    const experiment = await deleteVariant(id, variantId);
    return jsonOk(experiment);
  } catch (error) {
    return jsonError(error);
  }
}
