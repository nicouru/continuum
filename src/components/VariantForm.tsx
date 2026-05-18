"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/Button";
import { VariantPreview } from "@/components/VariantPreview";
import type { TypographyVariant } from "@/lib/types";

const EMPTY: Omit<TypographyVariant, "id"> = {
  label: "",
  fontFamily: '"Lato", sans-serif',
  fontImportUrl: "https://fonts.googleapis.com/css2?family=Lato:wght@300&display=swap",
  fontWeight: 300,
  fontSizeRem: 1.05,
  lineHeight: 1.65,
  letterSpacingEm: 0,
  wordSpacingEm: 0,
  maxWidthRem: 42,
  color: "#1a1a1a",
};

export function VariantForm({
  experimentId,
  variant,
  previewText,
}: {
  experimentId: string;
  variant?: TypographyVariant;
  previewText: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<Omit<TypographyVariant, "id">>(
    variant ?? EMPTY,
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const previewVariant: TypographyVariant = {
    id: variant?.id ?? "preview",
    ...form,
  };

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const url = variant
      ? `/api/experiments/${experimentId}/variants/${variant.id}`
      : `/api/experiments/${experimentId}/variants`;

    const response = await fetch(url, {
      method: variant ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(payload.error ?? "No se pudo guardar la variante.");
      setSaving(false);
      return;
    }

    router.push(`/experiments/${experimentId}`);
    router.refresh();
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Etiqueta interna" value={form.label} onChange={(value) => setForm({ ...form, label: value })} />
        <Field label="fontFamily" value={form.fontFamily} onChange={(value) => setForm({ ...form, fontFamily: value })} />
        <Field
          label="fontImportUrl (opcional)"
          value={form.fontImportUrl ?? ""}
          onChange={(value) => setForm({ ...form, fontImportUrl: value || undefined })}
        />
        <NumberField label="fontWeight" value={form.fontWeight} onChange={(value) => setForm({ ...form, fontWeight: value })} />
        <NumberField label="fontSizeRem" value={form.fontSizeRem} step={0.01} onChange={(value) => setForm({ ...form, fontSizeRem: value })} />
        <NumberField label="lineHeight" value={form.lineHeight} step={0.01} onChange={(value) => setForm({ ...form, lineHeight: value })} />
        <NumberField label="letterSpacingEm" value={form.letterSpacingEm} step={0.001} onChange={(value) => setForm({ ...form, letterSpacingEm: value })} />
        <NumberField label="wordSpacingEm" value={form.wordSpacingEm} step={0.001} onChange={(value) => setForm({ ...form, wordSpacingEm: value })} />
        <NumberField label="maxWidthRem" value={form.maxWidthRem} step={0.5} onChange={(value) => setForm({ ...form, maxWidthRem: value })} />
        <Field label="color" value={form.color} onChange={(value) => setForm({ ...form, color: value })} />
        <Field
          label="fontVariationSettings (opcional)"
          value={form.fontVariationSettings ?? ""}
          onChange={(value) =>
            setForm({ ...form, fontVariationSettings: value || undefined })
          }
        />
        <Field
          label="Notas (opcional)"
          value={form.notes ?? ""}
          onChange={(value) => setForm({ ...form, notes: value || undefined })}
        />

        {error ? <p className="text-sm text-red-700">{error}</p> : null}

        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Guardando…" : "Guardar variante"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push(`/experiments/${experimentId}`)}
          >
            Cancelar
          </Button>
        </div>
      </form>

      <div>
        <h3 className="mb-3 text-sm font-medium text-neutral-700">Vista previa</h3>
        <VariantPreview variant={previewVariant} sampleText={previewText} />
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="text-neutral-700">{label}</span>
      <input
        className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
}) {
  return (
    <label className="block text-sm">
      <span className="text-neutral-700">{label}</span>
      <input
        type="number"
        step={step}
        className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
