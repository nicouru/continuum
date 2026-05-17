# ADR 0001: Use TipTap And ProseMirror For Structured Editing

Status: Accepted

## Context

Continuum must preserve Diario's structured editor semantics: aphorisms,
references, superindices, long quotes, inline math, stable paragraph identity,
and conversion to `StructuredNoteDraft`.

## Decision

Use TipTap as the React-facing editor framework and ProseMirror as the document
and transaction model.

## Consequences

- Editor behavior is structured, not plain text.
- All document mutations must respect ProseMirror schema and transactions.
- Visual editor fixes must not mutate document JSON unless they represent real
  editorial content.
- Future mobile clients must either share the same structured contract or use a
  compatible adapter.

## Validation

- TipTap round-trip tests.
- Structured draft golden fixtures.
- Editor command tests for aphorisms, references, math, and correction mapping.
