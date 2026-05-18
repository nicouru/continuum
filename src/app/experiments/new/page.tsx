"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";

export default function NewExperimentPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const response = await fetch("/api/experiments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description }),
    });

    const payload = (await response.json()) as {
      error?: string;
      id?: string;
    };

    if (!response.ok || !payload.id) {
      setError(
        "error" in payload && payload.error
          ? payload.error
          : "No se pudo crear el experimento.",
      );
      setLoading(false);
      return;
    }

    router.push(`/experiments/${payload.id}`);
  }

  return (
    <AppShell title="Nuevo experimento">
      <form onSubmit={handleSubmit} className="max-w-xl space-y-4 rounded border border-neutral-300 bg-white p-5">
        <label className="block text-sm">
          Título
          <input
            className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          Descripción
          <textarea
            className="mt-1 min-h-24 w-full rounded border border-neutral-300 px-2 py-1.5"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <Button type="submit" disabled={loading}>
          {loading ? "Creando…" : "Crear experimento"}
        </Button>
      </form>
    </AppShell>
  );
}
