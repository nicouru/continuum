# Continuum Invariants

These invariants are non-negotiable. Any change that touches them needs explicit
tests and a compatibility note.

1. `StructuredNoteDraft` is the wire contract between Continuum and Diario.
2. `StructuredNoteDraft.id` and block IDs remain stable across autosave, sync,
   paragraph splits, paragraph merges, and local edits.
3. Diario and Continuum must not diverge in structured draft semantics without a
   migration plan and golden fixtures.
4. A draft saved in Continuum must remain readable by Diario's editor and
   publishable by Diario's backend.
5. The Reader must continue to render existing notes after editor changes.
6. Saving and autosaving always mean draft; publishing is an explicit lifecycle
   action.
7. Local SQLite is the source of local truth while offline; Diario is the remote
   draft authority when synchronized.
8. Autosave must never block typing.
9. Sync is eventual and must tolerate offline use, retries, and process restarts.
10. Conflict handling must preserve local text. Never overwrite a local draft
    without an explicit user action.
11. Trash is reversible until a future explicit permanent-delete action exists.
12. SQLite schema changes require migrations and tests.
13. Tauri Store is not a secure place for release-candidate secrets.
14. OpenAI API keys and Diario session cookies must move to OS Keychain or
    Stronghold before release candidate.
15. The Tauri app must not ship with `csp: null`.
16. TipTap/ProseMirror schema is the editor authority. Do not patch DOM output
    behind its back.
17. Empty editor behavior must not be implemented with invisible content,
    fake spaces, hidden paragraphs, or `&nbsp;`.
18. AI correction is advisory. It must not mutate document structure except via
    safe ProseMirror transactions.
19. AI correction must preserve marks, references, superindices, aphorism IDs,
    citation structures, and math atoms unless a safe transaction proves the
    change is textual only.
20. Text diffs are not document positions. ProseMirror mapping is the source of
    truth for applying changes.
21. A correction suggestion that cannot be mapped safely is `unsafe` or `stale`;
    it is never forced into the document.
22. Lexical providers are replaceable. UI must not depend directly on a single
    provider such as RAE.
23. The editor must preserve the author's Spanish voice unless the user
    explicitly requests rewriting.
24. UI panels must not move the writing column unexpectedly.
25. Desktop UI decisions must keep future iOS and Android clients in mind.
26. Contract changes require considering Mac, future mobile clients, Diario
    admin editor, Diario public reader, and sync.
27. Agents must prefer small validated changes over large rewrites.
28. Repository memory lives in files, not in chat history.
29. Any recurring architectural rule belongs in `.context/` or an ADR.
30. A feature is not complete until a future agent can understand its boundaries
    without reading the entire conversation that produced it.
