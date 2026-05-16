# Continuum Mac

Tauri 2 desktop shell for Continuum.

## Run

```bash
pnpm tauri:dev
```

The Vite-only command is useful for frontend iteration, but SQLite, Store, FS,
and HTTP plugin behavior require Tauri.

## Build

```bash
pnpm tauri:build
```

Artifacts are written under:

```txt
apps/mac/src-tauri/target/release/bundle/
```

## Runtime Notes

- Login happens inside the app against Diario.
- Draft saves stay local first, then sync through Diario HTTP APIs.
- Local SQLite is a cache, offline queue, and recovery store. Diario remains the
  canonical source of truth.
- The app imports remote Diario drafts after login and skips local notes with
  pending/conflicting changes.
