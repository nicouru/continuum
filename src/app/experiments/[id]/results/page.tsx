import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ResultsPanel } from "@/components/ResultsPanel";
import { getExperiment } from "@/lib/repository";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ResultsPage({ params }: PageProps) {
  const { id } = await params;
  const experiment = await getExperiment(id);

  if (!experiment) {
    notFound();
  }

  return (
    <AppShell title="Resultados">
      <ResultsPanel experiment={experiment} />
    </AppShell>
  );
}
