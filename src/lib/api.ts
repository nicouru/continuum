import { NextResponse } from "next/server";

export function jsonOk<T>(data: T, status = 200): NextResponse<T> {
  return NextResponse.json(data, { status });
}

export function jsonError(error: unknown, status = 400): NextResponse<{ error: string }> {
  const message =
    error instanceof Error ? error.message : "Ocurrió un error inesperado.";
  return NextResponse.json({ error: message }, { status });
}
