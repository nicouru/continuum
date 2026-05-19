# Continuum Agent Guide

Continuum is the Mac-first authoring app for Diario de Ocurrencias. Treat this
repo as an editor, sync, and local-first data system, not as a generic React
app. Before changing code, read the context files in `.context/` and the
relevant ADRs in `docs/adr/`.

Continuum is coordinated with Diario, but it is not the publication authority.
Read `docs/diario-coordination.md` before changing structured note contracts,
sync payloads, references, citations, or publish/unpublish behavior.

## Required First Steps

1. Run `git status --short --branch` and identify the active branch.
2. Read `.context/invariants.md`.
3. Read `.context/glossary.md` for domain vocabulary.
4. Read any ADR relevant to the files you will touch.
5. Keep your change scoped to the requested task. Do not mix feature work,
   refactors, visual polish, and documentation unless explicitly asked.

## Validation Commands

Use the narrowest useful validation during development, then run the full set
before reporting completion for code changes:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @continuum/mac tauri build --bundles app
```

For Rust/Tauri shell changes, also run:

```bash
cd apps/mac/src-tauri && cargo check
```

For docs-only changes, at minimum run:

```bash
git diff --check
```

## Critical Paths

- `apps/mac/src/App.tsx`: main shell; currently large and high-risk.
- `apps/mac/src/ContinuumAiPanel.tsx`: AI correction UI.
- `apps/mac/src/ContinuumEditorMenu.tsx`: right-side editor command panel.
- `apps/mac/src/auth.ts`: Diario auth/session handling.
- `apps/mac/src/preferences.ts`: local preferences and secrets boundary.
- `apps/mac/src/ai-correction-sessions.ts`: cached AI correction sessions.
- `apps/mac/src-tauri/tauri.conf.json`: Tauri security and app config.
- `packages/core/src/*`: canonical structured note domain model.
- `packages/editor/src/*`: TipTap/ProseMirror schema, commands, conversion.
- `packages/storage/src/*`: SQLite schema, migrations, repositories.
- `packages/sync/src/*`: Diario draft sync and conflict policy.
- `packages/correction/src/*`: AI correction provider, diff, suggestions.
- `packages/lexical/src/*`: lexical lookup provider chain.
- `contract-fixtures/*`: cross-app structured draft fixtures.
- `.context/*`: persistent agent memory and product invariants.
- `docs/adr/*`: accepted architecture decisions.
- `docs/diario-coordination.md`: cross-repo relationship with Diario.

## Do Not Do

- Do not change the `StructuredNoteDraft` contract without tests, fixtures, and
  an explicit Diario compatibility note.
- Do not store OpenAI keys, Diario cookies, passwords, or tokens in plaintext
  for any release-candidate path.
- Do not apply AI corrections by raw DOM or string replacement. Use the
  ProseMirror document map and transactions.
- Do not add invisible text, fake spaces, hidden paragraphs, or `&nbsp;` hacks
  to make the editor look right.
- Do not bypass TipTap/ProseMirror schema rules to preserve a visual behavior.
- Do not touch Diario from this repo. Diario compatibility must be documented
  and tested through contracts.
- Do not rewrite `App.tsx` in a single large refactor. Extract one hook or
  subsystem at a time.
- Do not change autosave, sync, conflict handling, or publication behavior
  without targeted tests.
- Do not turn Continuum into a dashboard. The primary surface is writing.

## Branch And Report Discipline

- Use isolated task branches with descriptive names.
- Commit only the files belonging to the task.
- Leave the working tree clean unless explicitly handing off WIP.
- In the final report, include:
  - branch and commit;
  - files changed;
  - validation run;
  - remaining risks;
  - exact next review target for Codex.

## Product Direction

Continuum is intended to become the primary authoring interface. Diario remains
the canonical web backend and public reader. The core work is therefore not
just feature delivery: it is preserving a shared editorial data contract across
desktop, web, and future mobile clients.
