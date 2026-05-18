import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { VariantForm } from "@/components/VariantForm";
import { getExperiment } from "@/lib/repository";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string; variantId: string }>;
}

export default async function EditVariantPage({ params }: PageProps) {
  const { id, variantId } = await params;
  const experiment = await getExperiment(id);

  if (!experiment) {
    notFound();
  }

  const variant = experiment.variants.find((item) => item.id === variantId);

  if (!variant) {
    notFound();
  }

  const previewText =
    experiment.texts[0]?.content ??
    "Texto de vista previa. Agregá textos reales en el experimento.";

  return (
    <AppShell title={`Editar ${variant.label}`}>
      <VariantForm
        experimentId={experiment.id}
        variant={variant}
        previewText={previewText}
      />
    </AppShell>
  );
}
