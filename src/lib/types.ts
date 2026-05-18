export type ExperimentStatus = "draft" | "running" | "frozen";

export interface CriteriaLabels {
  readability30m: string;
  pretentiousness: string;
  fontDominatesText: string;
}

export interface TextSample {
  id: string;
  content: string;
  createdAt: string;
}

export interface TypographyVariant {
  id: string;
  label: string;
  fontFamily: string;
  fontImportUrl?: string;
  fontWeight: number;
  fontSizeRem: number;
  lineHeight: number;
  letterSpacingEm: number;
  wordSpacingEm: number;
  maxWidthRem: number;
  color: string;
  fontVariationSettings?: string;
  notes?: string;
}

export interface Vote {
  id: string;
  variantId: string;
  textSampleId: string;
  sessionId: string;
  readability30m: number;
  pretentiousness: number;
  fontDominatesText: number;
  comment?: string;
  createdAt: string;
}

export interface BlindSession {
  id: string;
  experimentId: string;
  createdAt: string;
  revealed: boolean;
  variantOrder: string[];
  labelByVariantId: Record<string, string>;
  votes: Vote[];
  completedAt?: string;
}

export interface Experiment {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  status: ExperimentStatus;
  freezeUntil?: string;
  winnerVariantId?: string;
  criteria: CriteriaLabels;
  texts: TextSample[];
  variants: TypographyVariant[];
  sessions: BlindSession[];
  decisionNote?: string;
}

export interface VariantRanking {
  variantId: string;
  label: string;
  voteCount: number;
  avgReadability30m: number;
  avgPretentiousness: number;
  avgFontDominatesText: number;
  avgScore: number;
  variant: TypographyVariant;
}
