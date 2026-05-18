import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { loadExperiments } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const experiments = await loadExperiments();

  return (
    <AppShell
      title="Experimentos"
      actions={
        <Link
          href="/experiments/new"
          className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Nuevo experimento
        </Link>
      }
    >
      <p className="mb-6 text-sm text-neutral-600">
        Compará variantes tipográficas con textos reales, votá en modo ciego y
        congelá una decisión por 30 días.
      </p>

      {experiments.length === 0 ? (
        <p className="text-sm text-neutral-600">No hay experimentos todavía.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-300 text-left text-neutral-600">
              <th className="py-2">Título</th>
              <th className="py-2">Estado</th>
              <th className="py-2">Ganadora</th>
              <th className="py-2">Congelado hasta</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {experiments.map((experiment) => {
              const winner = experiment.variants.find(
                (variant) => variant.id === experiment.winnerVariantId,
              );

              return (
                <tr key={experiment.id} className="border-b border-neutral-200">
                  <td className="py-3 font-medium">{experiment.title}</td>
                  <td className="py-3">
                    <StatusBadge status={experiment.status} />
                  </td>
                  <td className="py-3 text-neutral-700">{winner?.label ?? "—"}</td>
                  <td className="py-3 text-neutral-700">
                    {experiment.freezeUntil
                      ? new Date(experiment.freezeUntil).toLocaleDateString("es-AR")
                      : "—"}
                  </td>
                  <td className="py-3 text-right">
                    <Link
                      href={`/experiments/${experiment.id}`}
                      className="underline"
                    >
                      Abrir
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </AppShell>
  );
}
