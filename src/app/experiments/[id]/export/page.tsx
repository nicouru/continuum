import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ExportCssPanel } from "@/components/ExportCssPanel";
import { getExperiment } from "@/lib/repository";
import { findVariant } from "@/lib/scoring";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ExportPage({ params }: PageProps) {
  const { id } = await params;
  const experiment = await getExperiment(id);

  if (!experiment) {
    notFound();
  }

  if (!experiment.winnerVariantId) {
    return (
      <AppShell title="Exportar CSS">
        <p className="text-sm text-neutral-600">
          Elegí una variante ganadora en resultados antes de exportar CSS.
        </p>
      </AppShell>
    );
  }

  const winner = findVariant(experiment, experiment.winnerVariantId);

  if (!winner) {
    notFound();
  }

  return (
    <AppShell title="Exportar CSS">
      <p className="mb-4 text-sm text-neutral-600">
        CSS listo para copiar basado en la variante ganadora: <strong>{winner.label}</strong>
      </p>
      <ExportCssPanel variant={winner} />
    </AppShell>
  );
}
