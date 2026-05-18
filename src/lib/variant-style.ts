import type { CSSProperties } from "react";
import type { TypographyVariant } from "./types";

export function variantStyle(variant: TypographyVariant): CSSProperties {
  return {
    fontFamily: variant.fontFamily,
    fontWeight: variant.fontWeight,
    fontSize: `${variant.fontSizeRem}rem`,
    lineHeight: variant.lineHeight,
    letterSpacing: `${variant.letterSpacingEm}em`,
    wordSpacing: `${variant.wordSpacingEm}em`,
    maxWidth: `${variant.maxWidthRem}rem`,
    color: variant.color,
    fontVariationSettings: variant.fontVariationSettings,
  };
}
