import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ExperimentEditor } from "@/components/ExperimentEditor";
import { getExperiment } from "@/lib/repository";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ExperimentPage({ params }: PageProps) {
  const { id } = await params;
  const experiment = await getExperiment(id);

  if (!experiment) {
    notFound();
  }

  return (
    <AppShell title={experiment.title}>
      <ExperimentEditor experiment={experiment} />
    </AppShell>
  );
}
