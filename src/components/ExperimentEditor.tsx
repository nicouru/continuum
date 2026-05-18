"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/Button";
import { Section } from "@/components/Section";
import { StatusBadge } from "@/components/StatusBadge";
import type { Experiment } from "@/lib/types";
import { totalVoteCount } from "@/lib/scoring";

export function ExperimentEditor({ experiment }: { experiment: Experiment }) {
  const router = useRouter();
  const [title, setTitle] = useState(experiment.title);
  const [description, setDescription] = useState(experiment.description);
  const [newText, setNewText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const frozen = experiment.status === "frozen";
  const votes = totalVoteCount(experiment);
  const openSession = experiment.sessions.find((session) => !session.completedAt);
  const winner = experiment.variants.find(
    (variant) => variant.id === experiment.winnerVariantId,
  );

  async function patchExperiment(body: Record<string, unknown>) {
    const response = await fetch(`/api/experiments/${experiment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "No se pudo actualizar.");
    }
    router.refresh();
  }

  async function handleSaveMeta() {
    try {
      await patchExperiment({ title, description });
      setMessage("Datos guardados.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error");
    }
  }

  async function handleAddText() {
    const response = await fetch(`/api/experiments/${experiment.id}/texts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newText }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(payload.error ?? "No se pudo agregar texto.");
      return;
    }
    setNewText("");
    router.refresh();
  }

  async function handleDeleteText(textId: string) {
    await fetch(`/api/experiments/${experiment.id}/texts/${textId}`, {
      method: "DELETE",
    });
    router.refresh();
  }

  async function handleStartBlind() {
    const response = await fetch(`/api/experiments/${experiment.id}/blind`, {
      method: "POST",
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(payload.error ?? "No se pudo iniciar comparación.");
      return;
    }
    router.push(`/experiments/${experiment.id}/blind`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={experiment.status} />
        {winner ? (
          <span className="text-sm text-neutral-700">Ganadora: {winner.label}</span>
        ) : null}
        {experiment.freezeUntil ? (
          <span className="text-sm text-neutral-600">
            Congelado hasta {new Date(experiment.freezeUntil).toLocaleDateString("es-AR")}
          </span>
        ) : null}
      </div>

      {message ? <p className="text-sm text-neutral-600">{message}</p> : null}

      <Section title="Datos básicos">
        <div className="space-y-3">
          <label className="block text-sm">
            Título
            <input
              className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5"
              value={title}
              disabled={frozen}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            Descripción
            <textarea
              className="mt-1 min-h-24 w-full rounded border border-neutral-300 px-2 py-1.5"
              value={description}
              disabled={frozen}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          {!frozen ? (
            <Button type="button" onClick={handleSaveMeta}>
              Guardar datos
            </Button>
          ) : null}
        </div>
      </Section>

      <Section
        title="Textos reales"
        description="Pegá entre 10 y 30 textos para evaluar legibilidad real."
        actions={
          !frozen ? (
            <span className="text-xs text-neutral-500">{experiment.texts.length} textos</span>
          ) : null
        }
      >
        <ul className="space-y-3">
          {experiment.texts.map((text) => (
            <li key={text.id} className="rounded border border-neutral-200 p-3 text-sm">
              <p className="whitespace-pre-wrap text-neutral-800">{text.content}</p>
              {!frozen ? (
                <Button
                  type="button"
                  variant="danger"
                  className="mt-2"
                  onClick={() => handleDeleteText(text.id)}
                >
                  Borrar
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {!frozen ? (
          <div className="space-y-2 pt-2">
            <textarea
              className="min-h-28 w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
              placeholder="Pegá un texto real…"
              value={newText}
              onChange={(event) => setNewText(event.target.value)}
            />
            <Button type="button" onClick={handleAddText}>
              Agregar texto
            </Button>
          </div>
        ) : null}
      </Section>

      <Section
        title="Variantes tipográficas"
        actions={
          !frozen ? (
            <Link
              href={`/experiments/${experiment.id}/variants/new`}
              className="rounded border border-neutral-400 px-3 py-1.5 text-sm hover:bg-neutral-100"
            >
              Nueva variante
            </Link>
          ) : null
        }
      >
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-neutral-600">
              <th className="py-2">Etiqueta</th>
              <th className="py-2">Familia</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {experiment.variants.map((variant) => (
              <tr key={variant.id} className="border-b border-neutral-100">
                <td className="py-2">{variant.label}</td>
                <td className="py-2 font-mono text-xs">{variant.fontFamily}</td>
                <td className="py-2 text-right">
                  {!frozen ? (
                    <Link
                      href={`/experiments/${experiment.id}/variants/${variant.id}`}
                      className="text-neutral-800 underline"
                    >
                      Editar
                    </Link>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Acciones">
        <div className="flex flex-wrap gap-2">
          {!frozen ? (
            <Button
              type="button"
              onClick={handleStartBlind}
              disabled={Boolean(openSession)}
            >
              {openSession ? "Sesión ciega en curso" : "Iniciar comparación ciega"}
            </Button>
          ) : null}
          {openSession ? (
            <Link
              href={`/experiments/${experiment.id}/blind`}
              className="rounded border border-neutral-400 px-3 py-2 text-sm hover:bg-neutral-100"
            >
              Continuar comparación
            </Link>
          ) : null}
          <Link
            href={`/experiments/${experiment.id}/results`}
            className={`rounded border px-3 py-2 text-sm ${
              votes > 0
                ? "border-neutral-400 hover:bg-neutral-100"
                : "pointer-events-none border-neutral-200 text-neutral-400"
            }`}
          >
            Ver resultados
          </Link>
          {experiment.winnerVariantId ? (
            <Link
              href={`/experiments/${experiment.id}/export`}
              className="rounded border border-neutral-400 px-3 py-2 text-sm hover:bg-neutral-100"
            >
              Exportar CSS
            </Link>
          ) : null}
        </div>
      </Section>
    </div>
  );
}
