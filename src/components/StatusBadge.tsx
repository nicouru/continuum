import type { ExperimentStatus } from "@/lib/types";

const LABELS: Record<ExperimentStatus, string> = {
  draft: "Borrador",
  running: "En curso",
  frozen: "Congelado",
};

const STYLES: Record<ExperimentStatus, string> = {
  draft: "bg-neutral-200 text-neutral-800",
  running: "bg-amber-100 text-amber-900",
  frozen: "bg-sky-100 text-sky-900",
};

export function StatusBadge({ status }: { status: ExperimentStatus }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}
