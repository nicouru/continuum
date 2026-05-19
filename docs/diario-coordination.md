# Diario Coordination

Continuum is a separate repository, but it is not a separate editorial system.
It is the primary desktop authoring client for Diario de Ocurrencias.

## Operating Rule

Diario de Ocurrencias remains the publication authority.

Continuum may create, edit, save, sync, and prepare notes. Diario decides what
is publishable, stores the canonical web draft/publication lifecycle, and serves
the public Reader.

## Repository Roles

- `nicouru/continuum`: local-first desktop authoring, autosave, SQLite,
  TipTap editing, draft sync, and future mobile-compatible client behavior.
- `nicouru/diario-de-ocurrencias`: web admin, publication lifecycle, public
  Reader, server APIs, deployed content, and final validation before publishing.

## Shared Contract

Changes to structured note data are cross-repo changes when they affect:

- `StructuredNoteDraft`
- aphorism IDs or numbering
- paragraph/block/segment identity
- citations and superscripts
- references and reference inserts
- inline math
- draft sync payloads
- publish/unpublish semantics

Those changes must state whether Diario, Continuum, or both need matching code
and tests.

## Cross-Repo Change Checklist

For any change touching the shared contract or publication flow, include this
block in the PR or final report:

```text
Cross-repo impact:
- Continuum: required / optional / not affected
- Diario: required / optional / not affected
- Shared contract changed: yes / no
- Data migration needed: yes / no
- Reader behavior changed: yes / no
- Admin/editor behavior changed: yes / no
```

## Branch Convention

Branches do not need to be mirrored for ordinary work. When a feature requires
both repos, use the same short branch name in each repo when practical:

```text
feature/internal-note-links
```

Each repo should still validate and merge independently.

## What Not To Do

- Do not let Continuum invent a publication state that Diario does not accept.
- Do not let Diario change the structured draft contract without a Continuum
  compatibility note.
- Do not use URLs as the only durable link between notes; use stable IDs and
  resolve slugs at render time.
- Do not couple desktop packaging concerns to the web deploy pipeline.

## Future Direction

If coordination becomes heavier, extract the shared structured-note contract to
a small package. Until then, this document is the lightweight coordination
layer.
