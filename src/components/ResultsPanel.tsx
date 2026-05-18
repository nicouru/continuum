"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/Button";
import type { Experiment } from "@/lib/types";
import { rankVariants, totalVoteCount } from "@/lib/scoring";

export function ResultsPanel({ experiment }: { experiment: Experiment }) {
  const router = useRouter();
  const rankings = rankVariants(experiment);
  const [winnerVariantId, setWinnerVariantId] = useState(
    experiment.winnerVariantId ?? rankings[0]?.variantId ?? "",
  );
  const [decisionNote, setDecisionNote] = useState(experiment.decisionNote ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const votes = totalVoteCount(experiment);
  const frozen = experiment.status === "frozen";

  async function chooseWinner() {
    const response = await fetch(`/api/experiments/${experiment.id}/winner`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ winnerVariantId, decisionNote }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(payload.error ?? "No se pudo guardar ganadora.");
      return;
    }
    setMessage("Ganadora guardada.");
    router.refresh();
  }

  async function freezeDecision() {
    const response = await fetch(`/api/experiments/${experiment.id}/freeze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decisionNote }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(payload.error ?? "No se pudo congelar.");
      return;
    }
    setMessage("Decisión congelada por 30 días.");
    router.refresh();
  }

  if (votes === 0) {
    return (
      <p className="text-sm text-neutral-600">
        Todavía no hay votos. Iniciá una comparación ciega y completá la sesión.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-300 text-left text-neutral-600">
            <th className="py-2">#</th>
            <th className="py-2">Fuente real</th>
            <th className="py-2">Votos</th>
            <th className="py-2">Legibilidad 30m</th>
            <th className="py-2">Pretenciosidad</th>
            <th className="py-2">Letra domina</th>
            <th className="py-2">Score</th>
          </tr>
        </thead>
        <tbody>
          {rankings.map((row, index) => (
            <tr key={row.variantId} className="border-b border-neutral-100">
              <td className="py-2">{index + 1}</td>
              <td className="py-2 font-medium">{row.label}</td>
              <td className="py-2">{row.voteCount}</td>
              <td className="py-2">{row.avgReadability30m.toFixed(2)}</td>
              <td className="py-2">{row.avgPretentiousness.toFixed(2)}</td>
              <td className="py-2">{row.avgFontDominatesText.toFixed(2)}</td>
              <td className="py-2 font-semibold">{row.avgScore.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {!frozen ? (
        <div className="space-y-3 rounded border border-neutral-200 p-4">
          <label className="block text-sm">
            Elegir ganadora
            <select
              className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5"
              value={winnerVariantId}
              onChange={(event) => setWinnerVariantId(event.target.value)}
            >
              {rankings.map((row) => (
                <option key={row.variantId} value={row.variantId}>
                  {row.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Nota de decisión
            <textarea
              className="mt-1 min-h-20 w-full rounded border border-neutral-300 px-2 py-1.5"
              value={decisionNote}
              onChange={(event) => setDecisionNote(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={chooseWinner}>
              Guardar ganadora
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                if (!experiment.winnerVariantId) {
                  await chooseWinner();
                }
                await freezeDecision();
              }}
              disabled={!winnerVariantId}
            >
              Congelar por 30 días
            </Button>
          </div>
        </div>
      ) : null}

      {message ? <p className="text-sm text-neutral-600">{message}</p> : null}

      {experiment.winnerVariantId ? (
        <Link
          href={`/experiments/${experiment.id}/export`}
          className="inline-block text-sm underline"
        >
          Ir a exportar CSS
        </Link>
      ) : null}
    </div>
  );
}
