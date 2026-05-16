# Editor visual contract

Continuum uses TipTap/ProseMirror as the canonical editor model across the Mac app and the Diario web editor. A new empty note must remain a single editable structured paragraph. Do not add invisible characters, non-breaking spaces, manual `<br>` nodes, extra paragraphs, or schema-level placeholder nodes to correct caret placement.

## Empty editor caret

The Mac editor runs inside Tauri/WebKit. WebKit can place the caret for an empty contenteditable paragraph slightly above the baseline used once real Sabon text is present. The intended behavior is that a new empty note shows the caret where the first typed line will appear.

The correction lives only in layout CSS:

- Scope it to `.continuum-editor-surface .tiptap p.is-editor-empty:first-child`.
- Use only box metrics such as `min-height`, `line-height`, and `padding-top`.
- Keep the offset in `--continuum-empty-caret-offset` so future typography changes have one place to recalibrate.
- Never use `content`, `&nbsp;`, hidden text, or document mutations for this.

This rule affects only the visual state of a fully empty editor. It must not affect copy/paste, `StructuredNoteDraft`, TipTap JSON, sync, export, aphorisms, references, or published output.
