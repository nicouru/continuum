export function requireNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${field} es obligatorio.`);
  }
  return trimmed;
}

export function parseRating(value: unknown, field: string): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 5) {
    throw new Error(`${field} debe ser un entero entre 1 y 5.`);
  }
  return numeric;
}

export function parsePositiveNumber(value: unknown, field: string): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`${field} debe ser un número positivo.`);
  }
  return numeric;
}
