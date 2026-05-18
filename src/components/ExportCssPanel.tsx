"use client";

import { useState } from "react";
import { buildCanonCss } from "@/lib/css-export";
import type { TypographyVariant } from "@/lib/types";

export function ExportCssPanel({ variant }: { variant: TypographyVariant }) {
  const css = buildCanonCss(variant);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(css);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-3">
      <pre className="overflow-x-auto rounded border border-neutral-300 bg-neutral-950 p-4 text-xs text-neutral-100">
        {css}
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
      >
        {copied ? "Copiado" : "Copiar CSS"}
      </button>
    </div>
  );
}
