import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BlindComparison } from "@/components/BlindComparison";
import { getExperiment } from "@/lib/repository";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BlindPage({ params }: PageProps) {
  const { id } = await params;
  const experiment = await getExperiment(id);

  if (!experiment) {
    notFound();
  }

  const session = experiment.sessions.find((item) => !item.completedAt);

  if (!session) {
    redirect(`/experiments/${id}`);
  }

  return (
    <AppShell title="Comparación ciega">
      <BlindComparison experiment={experiment} session={session} />
    </AppShell>
  );
}
