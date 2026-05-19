# ADR 0004: Treat StructuredNoteDraft As A Shared Contract

Status: Accepted

## Context

Continuum, Diario's web editor, Diario's backend, and the public Reader all
depend on the same note structure. Divergence can corrupt aphorisms,
references, excerpts, publication, or sync.

## Decision

`StructuredNoteDraft` is the canonical cross-app contract. Continuum owns a
typed implementation in `packages/core`; Diario compatibility must be preserved
through fixtures, validation, and explicit migration notes.

## Consequences

- Breaking contract changes require a planned migration.
- Both repos need shared fixtures or a shared package strategy.
- Agents must not alter structured draft semantics casually.
- Reader compatibility is part of editor work.

## Validation

- Golden fixtures in `contract-fixtures/`.
- Structured validation tests.
- TipTap JSON to `StructuredNoteDraft` round-trip tests.
- Diario parity tests before shared-contract refactors land.
