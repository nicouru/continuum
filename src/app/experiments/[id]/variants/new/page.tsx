import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { VariantForm } from "@/components/VariantForm";
import { getExperiment } from "@/lib/repository";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function NewVariantPage({ params }: PageProps) {
  const { id } = await params;
  const experiment = await getExperiment(id);

  if (!experiment) {
    notFound();
  }

  if (experiment.status === "frozen") {
    notFound();
  }

  const previewText =
    experiment.texts[0]?.content ??
    "Texto de vista previa. Agregá textos reales en el experimento.";

  return (
    <AppShell title="Nueva variante">
      <VariantForm experimentId={experiment.id} previewText={previewText} />
    </AppShell>
  );
}
