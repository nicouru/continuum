"use client";

import { FontImport } from "@/components/FontImport";
import type { TypographyVariant } from "@/lib/types";
import { variantStyle } from "@/lib/variant-style";

export function VariantPreview({
  variant,
  sampleText,
}: {
  variant: TypographyVariant;
  sampleText: string;
}) {
  return (
    <div className="rounded border border-neutral-300 bg-white p-6">
      <FontImport href={variant.fontImportUrl} />
      <p style={variantStyle(variant)} className="whitespace-pre-wrap">
        {sampleText}
      </p>
    </div>
  );
}
