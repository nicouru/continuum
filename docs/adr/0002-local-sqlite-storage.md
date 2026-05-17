# ADR 0002: Use SQLite For Local Desktop Storage

Status: Accepted

## Context

Continuum is a primary writing app. It must be fast, local-first, usable
offline, and able to recover work even when network sync fails.

## Decision

Use SQLite as the local note database. Store structured draft JSON, TipTap JSON,
plain text, excerpts, metadata, revisions, sync queue entries, conflicts, and
indexes locally.

## Consequences

- Local saves are durable before remote sync completes.
- Schema evolution requires migrations.
- Sync can retry across process restarts.
- Tauri Store remains for small preferences only, not note data or release
  secrets.

## Validation

- Repository tests for SQLite behavior.
- Migration tests for schema changes.
- Trash, restore, conflict, and revision tests.
