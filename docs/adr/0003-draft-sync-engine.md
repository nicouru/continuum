# ADR 0003: Sync Drafts Through Diario Instead Of Direct Database Access

Status: Accepted

## Context

Continuum and future mobile apps need to write the same drafts used by Diario,
but direct production database access would bypass validation, auth, lifecycle,
and conflict rules.

## Decision

Continuum syncs through Diario admin HTTP endpoints. Local writes are queued,
sent as drafts, and checked against remote revisions. Publishing remains an
explicit Diario lifecycle command.

## Consequences

- Diario remains remote authority for drafts and publication.
- Continuum can work offline and reconcile later.
- Conflicts are surfaced instead of silently overwritten.
- Fly/backend load is controlled by debounce, queueing, and remote revision
  checks.

## Validation

- Sync engine tests.
- HTTP remote client tests.
- Conflict tests for remote revision mismatch.
- Manual tests with real Diario login before release.
