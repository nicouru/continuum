import type { TypographyVariant } from "./types";

export function buildCanonCss(variant: TypographyVariant): string {
  const variationLine = variant.fontVariationSettings
    ? `  font-variation-settings: ${variant.fontVariationSettings};\n`
    : "";

  const importComment = variant.fontImportUrl
    ? `/* Import: ${variant.fontImportUrl} */\n`
    : "";

  return `${importComment}:root {
  --canon-font-body: ${JSON.stringify(variant.fontFamily)};
  --canon-font-body-weight: ${variant.fontWeight};
  --canon-font-body-size: ${variant.fontSizeRem}rem;
  --canon-font-body-line-height: ${variant.lineHeight};
  --canon-font-body-letter-spacing: ${variant.letterSpacingEm}em;
  --canon-font-body-word-spacing: ${variant.wordSpacingEm}em;
  --canon-font-body-max-width: ${variant.maxWidthRem}rem;
  --canon-font-body-color: ${variant.color};
}

.body-text {
  font-family: var(--canon-font-body);
  font-weight: var(--canon-font-body-weight);
  font-size: var(--canon-font-body-size);
  line-height: var(--canon-font-body-line-height);
  letter-spacing: var(--canon-font-body-letter-spacing);
  word-spacing: var(--canon-font-body-word-spacing);
  max-width: var(--canon-font-body-max-width);
  color: var(--canon-font-body-color);
${variationLine}}`;
}
