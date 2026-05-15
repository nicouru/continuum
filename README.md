# Continuum

Continuum is the Mac-first authoring app for Diario de Ocurrencias.

It is designed to replace Ulysses as the primary writing interface while
preserving the structured editing model already used by the Diario web editor:
paragraphs, aphorisms, citations/superscripts, references, reference inserts,
inline math, manual indents, written dates, stable IDs, drafts and future
publishing.

## Status

This repository contains the first MVP implementation.

Implemented:

- pnpm monorepo with `apps/mac` and shared packages.
- Tauri 2 + React + Vite desktop shell.
- TipTap-based editor package adapted from the Diario editor model.
- Local SQLite schema and repositories.
- Local autosave and manual draft save.
- Emergency current-note draft file.
- Trash and restore.
- Mock draft sync engine and Diario HTTP draft sync client.
- Remote revision checks for Diario draft pushes.
- Structured note validation/conversion tests.

Mocked or deferred:

- Publishing/update/unpublish commands.
- Search UI and SQLite FTS5 migrations.
- Conflict resolution UI beyond detecting and recording remote conflicts.
- Full visual parity audit against Diario edge cases.
- Production app icon/branding pass.

## Repository Shape

```txt
apps/
  mac/              Tauri + React app shell
packages/
  core/             Structured note types, validation, normalization, IDs
  editor/           TipTap extensions, actions, conversions, editor component
  storage/          SQLite schema, repositories, revisions, emergency helpers
  sync/             Sync states, mock remote client, conflict detection
docs/               Architecture and product notes
```

## Source Reference

The editor behavior is based on the current Diario repo:

```txt
https://github.com/nicouru/diario-de-ocurrencias.git
branch: codex/work
```

Important source areas used as references include:

- `src/components/AdminTipTapPrototype.tsx`
- `src/components/AdminTipTapExtensions.tsx`
- `src/components/AdminTipTapEditor*`
- `src/components/tiptap-editor/*`
- `src/components/tiptap-toolbar/*`
- `src/admin/structured-note-draft/*`
- `src/admin/tiptap-document.ts`
- `src/admin/tiptap-autosave.ts`
- `src/server/structured-note-draft-api-handlers.ts`
- `src/app/api/admin/v1/tiptap-draft/route.ts`

The Diario repo is the source of truth for future parity checks.

## Install

```bash
pnpm install
```

## Development

Vite-only development:

```bash
pnpm dev
```

The browser-only Vite app cannot access Tauri SQLite APIs, so it will show the
fallback error telling you to run through Tauri.

Desktop development:

```bash
pnpm tauri:dev
```

Native bundle:

```bash
pnpm tauri:build
```

The Tauri commands require a working Rust toolchain.

## Validation

```bash
pnpm typecheck
pnpm test
pnpm build
cd apps/mac/src-tauri && cargo check
```

Current known build note: Vite reports a large JavaScript chunk around 900 kB
because TipTap/ProseMirror/KaTeX are bundled together. That is not currently a
functional failure; code splitting is a follow-up.

## Storage

SQLite is the primary local note database.

The schema stores:

- note metadata;
- structured draft JSON;
- TipTap JSON;
- plain text and excerpt;
- local/remote version metadata;
- revisions;
- reference and citation indexes;
- sync queue/conflicts.

Tauri Store is only for small UI preferences. The emergency draft file is only a
temporary recovery layer for the active note.

## Sync

Architecture note: see
[`docs/sync-architecture.md`](docs/sync-architecture.md) for the source-of-truth
model, cross-device sync expectations, save timing, conflict policy, and Fly
operating assumptions.

Save and autosave always mean draft. They never publish.

Continuum uses a mock remote by default so local writing works without a Diario
backend.

To try real Diario admin draft sync, create `apps/mac/.env` from
`apps/mac/.env.example`:

```bash
cd apps/mac
cp .env.example .env
```

Then set:

```env
VITE_DIARIO_ADMIN_BASE_URL=http://localhost:3000
VITE_DIARIO_ADMIN_SESSION_COOKIE=diario_admin_session=...
```

The current Diario endpoint is:

```txt
POST /api/admin/v1/tiptap-draft
body: { "draft": StructuredNoteDraft, "baseRemoteRevision": number }
```

The app sends that request through the Tauri HTTP plugin and falls back to the
mock remote when no base URL is configured. Current Diario admin writes require
the web backend to be configured for local SQLite writes and admin write mode.

Continuum also reads the Diario draft metadata through
`GET /api/admin/v1/tiptap-draft?noteId=<id>` and stores the returned
`remoteRevision` locally as `remoteVersion`. A `409 conflict` response means the
server moved forward from another client and the local note is marked as a sync
conflict instead of being overwritten.

Never commit real admin cookies or secrets. The app must never connect directly
to the production database.

## Next Review Items

- Audit TipTap JSON <-> StructuredNoteDraft parity against Diario golden cases.
- Add conflict UI for keep-local / keep-remote / duplicate.
- Add SQLite FTS5 migrations after the search model is ready.
- Code-split TipTap/KaTeX vendor chunks.
- Exercise the app through `pnpm tauri:dev` on macOS with real writing sessions.
