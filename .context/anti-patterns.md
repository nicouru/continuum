# Anti-Patterns

These are patterns that either caused problems already or are explicitly
rejected for this project.

1. **Conversation-only architecture**: relying on chat memory instead of files
   in `.context/`, ADRs, tests, and fixtures.
2. **Big-bang `App.tsx` rewrite**: replacing the shell in one pass instead of
   extracting one subsystem at a time.
3. **Plaintext release secrets**: keeping OpenAI keys or Diario session cookies
   in Tauri Store for release-candidate builds.
4. **Duplicated draft contracts**: maintaining separate `StructuredNoteDraft`
   definitions in Continuum and Diario without shared tests.
5. **Treating TipTap as plain text**: assuming string offsets are enough to
   safely edit a structured ProseMirror document.
6. **Raw DOM correction**: applying AI corrections through DOM selection or
   string replacement instead of ProseMirror transactions.
7. **Invisible content hacks**: adding hidden spaces, fake paragraphs, `&nbsp;`,
   or pseudo-content to solve editor layout.
8. **Forcing unsafe suggestions**: applying a correction after mapping fails
   because the UI "probably meant it."
9. **Unreadable invisible diffs**: showing changes like `Quitar " "` instead of
   human labels for spaces, punctuation, or line breaks.
10. **Provider-coupled UI**: designing lexical UI around one API response shape
    instead of a provider abstraction.
11. **Feature branches with mixed concerns**: combining UI polish, architecture,
    sync, and docs in one commit.
12. **Audit without artifacts**: producing long reports but no AGENTS,
    invariants, ADRs, tests, or implementation path.
13. **Manual-only deploy knowledge**: leaving important release steps only in
    chat history or local memory.
14. **Dashboard creep**: adding panels and status surfaces that compete with
    the text as the primary object.
15. **Unbounded local cache**: storing text/session caches forever without TTL,
    invalidation, or user-visible policy.
16. **Mobile afterthoughts**: making desktop-only contracts that future iOS and
    Android clients cannot share.
17. **Breaking Diario emergency editing**: assuming Continuum is the only editor
    before the web editor remains compatible.
18. **Skipping full validation after structural changes**: touching schema,
    sync, storage, or correction mapping without tests.
