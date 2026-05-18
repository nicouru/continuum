"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { RatingScale } from "@/components/RatingScale";
import { FontImport } from "@/components/FontImport";
import type { BlindSession, Experiment } from "@/lib/types";
import { variantStyle } from "@/lib/variant-style";
import { sessionExpectedVoteCount } from "@/lib/scoring";

type VoteDraft = {
  readability30m: number;
  pretentiousness: number;
  fontDominatesText: number;
};

function voteKey(variantId: string, textSampleId: string): string {
  return `${textSampleId}::${variantId}`;
}

export function BlindComparison({
  experiment,
  session,
}: {
  experiment: Experiment;
  session: BlindSession;
}) {
  const router = useRouter();
  const [textIndex, setTextIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const variants = session.variantOrder
    .map((id) => experiment.variants.find((variant) => variant.id === id))
    .filter((variant): variant is NonNullable<typeof variant> => Boolean(variant));

  const currentText = experiment.texts[textIndex];

  const existingVotes = useMemo(() => {
    const map = new Map<string, VoteDraft>();
    for (const vote of session.votes) {
      map.set(voteKey(vote.variantId, vote.textSampleId), {
        readability30m: vote.readability30m,
        pretentiousness: vote.pretentiousness,
        fontDominatesText: vote.fontDominatesText,
      });
    }
    return map;
  }, [session.votes]);

  const [drafts, setDrafts] = useState<Map<string, VoteDraft>>(() => new Map(existingVotes));

  if (!currentText) {
    return <p className="text-sm text-neutral-600">No hay textos en este experimento.</p>;
  }

  const required = sessionExpectedVoteCount(experiment);
  const savedCount = session.votes.length;

  async function saveVote(variantId: string, draft: VoteDraft) {
    const response = await fetch(`/api/experiments/${experiment.id}/votes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: session.id,
        variantId,
        textSampleId: currentText.id,
        ...draft,
      }),
    });

    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      throw new Error(payload.error ?? "No se pudo guardar el voto.");
    }

    await refreshExperiment();
  }

  async function refreshExperiment(): Promise<void> {
    const response = await fetch(`/api/experiments/${experiment.id}`);
    if (!response.ok) {
      return;
    }
    const updated = (await response.json()) as Experiment;
    const refreshed = updated.sessions.find((item) => item.id === session.id);
    if (!refreshed) {
      return;
    }
    const map = new Map<string, VoteDraft>();
    for (const vote of refreshed.votes) {
      map.set(voteKey(vote.variantId, vote.textSampleId), {
        readability30m: vote.readability30m,
        pretentiousness: vote.pretentiousness,
        fontDominatesText: vote.fontDominatesText,
      });
    }
    setDrafts(map);
  }

  async function saveCurrentTextVotes(): Promise<void> {
    for (const variant of variants) {
      const draft = drafts.get(voteKey(variant.id, currentText.id));
      if (!draft) {
        throw new Error(
          `Completá los tres criterios para ${session.labelByVariantId[variant.id]}.`,
        );
      }
      if (
        !draft.readability30m ||
        !draft.pretentiousness ||
        !draft.fontDominatesText
      ) {
        throw new Error(
          `Completá los tres criterios para ${session.labelByVariantId[variant.id]}.`,
        );
      }
      await saveVote(variant.id, draft);
    }
  }

  async function handleNext() {
    setBusy(true);
    setError(null);
    try {
      await saveCurrentTextVotes();
      if (textIndex < experiment.texts.length - 1) {
        setTextIndex((value) => value + 1);
      }
      await refreshExperiment();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error al guardar votos.");
    } finally {
      setBusy(false);
    }
  }

  async function handleFinish() {
    setBusy(true);
    setError(null);
    try {
      await saveCurrentTextVotes();
      const response = await fetch(
        `/api/experiments/${experiment.id}/blind/${session.id}`,
        { method: "POST" },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo terminar la sesión.");
      }
      router.push(`/experiments/${experiment.id}/results`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Error al terminar sesión.");
    } finally {
      setBusy(false);
    }
  }

  const isLastText = textIndex === experiment.texts.length - 1;

  return (
    <div className="space-y-6">
      <div className="rounded border border-neutral-300 bg-white p-4 text-sm text-neutral-700">
        <p>
          Texto {textIndex + 1} de {experiment.texts.length} · Votos guardados {savedCount}/
          {required}
        </p>
        <p className="mt-1 text-neutral-500">
          Los nombres de fuente están ocultos. Solo verás etiquetas anónimas.
        </p>
      </div>

      <article className="rounded border border-neutral-300 bg-neutral-100 p-4">
        <p className="whitespace-pre-wrap text-base text-neutral-900">{currentText.content}</p>
      </article>

      <div className="space-y-8">
        {variants.map((variant) => {
          const label = session.labelByVariantId[variant.id] ?? "Variante";
          const key = voteKey(variant.id, currentText.id);
          const draft = drafts.get(key) ?? {
            readability30m: 0,
            pretentiousness: 0,
            fontDominatesText: 0,
          };

          return (
            <section key={variant.id} className="space-y-4 rounded border border-neutral-300 bg-white p-5">
              <h3 className="text-sm font-semibold text-neutral-900">{label}</h3>
              <FontImport href={variant.fontImportUrl} />
              <p style={variantStyle(variant)} className="whitespace-pre-wrap">
                {currentText.content}
              </p>

              <div className="grid gap-3 md:grid-cols-3">
                <RatingScale
                  label={experiment.criteria.readability30m}
                  value={draft.readability30m}
                  onChange={(value) => {
                    const next = new Map(drafts);
                    next.set(key, { ...draft, readability30m: value });
                    setDrafts(next);
                  }}
                />
                <RatingScale
                  label={experiment.criteria.pretentiousness}
                  value={draft.pretentiousness}
                  onChange={(value) => {
                    const next = new Map(drafts);
                    next.set(key, { ...draft, pretentiousness: value });
                    setDrafts(next);
                  }}
                />
                <RatingScale
                  label={experiment.criteria.fontDominatesText}
                  value={draft.fontDominatesText}
                  onChange={(value) => {
                    const next = new Map(drafts);
                    next.set(key, { ...draft, fontDominatesText: value });
                    setDrafts(next);
                  }}
                />
              </div>
            </section>
          );
        })}
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        {!isLastText ? (
          <Button onClick={handleNext} disabled={busy}>
            Guardar y siguiente texto
          </Button>
        ) : (
          <Button onClick={handleFinish} disabled={busy}>
            Terminar sesión
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={() => router.push(`/experiments/${experiment.id}`)}
          disabled={busy}
        >
          Volver al experimento
        </Button>
      </div>
    </div>
  );
}
