import { jsonError, jsonOk } from "@/lib/api";
import { createExperiment, loadExperiments } from "@/lib/repository";

export async function GET() {
  try {
    const experiments = await loadExperiments();
    return jsonOk(experiments);
  } catch (error) {
    return jsonError(error, 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      title?: string;
      description?: string;
    };
    const experiment = await createExperiment({
      title: body.title ?? "",
      description: body.description,
    });
    return jsonOk(experiment, 201);
  } catch (error) {
    return jsonError(error);
  }
}
