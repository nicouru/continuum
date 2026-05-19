# ADR 0005: AI Correction Is Advisory And Transaction-Safe

Status: Accepted

## Context

Continuum needs AI-assisted spelling and grammar correction for selected text.
Selections may include marks, citations, superindices, aphorisms, and nearby
structured elements.

## Decision

Use OpenAI through a correction provider that returns conservative corrected
text. Compute local suggestions by diffing the selected plain text, then apply
each suggestion only through safe ProseMirror mapping and transactions.

## Consequences

- The model never receives authority to rewrite document structure directly.
- Suggestions can be `pending`, `applied`, `stale`, or `unsafe`.
- Unsafe or stale suggestions are not applied.
- The UI should represent changes in the corrected preview, not as a detached
  list when that obscures context.
- API keys must move to OS Keychain or Stronghold before release candidate.

## Validation

- Correction provider parser tests.
- Diff and suggestion offset tests.
- ProseMirror mapping tests with marks, references, superindices, aphorisms,
  long quotes, and inline math.
- Manual full-cycle tests with selected paragraphs.
