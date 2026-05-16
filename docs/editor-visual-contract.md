# Editor visual contract

Continuum uses TipTap/ProseMirror as the canonical editor model across the Mac app and the Diario web editor. A new empty note must remain a single editable structured paragraph. Do not add invisible characters, non-breaking spaces, manual `<br>` nodes, extra paragraphs, or schema-level placeholder nodes to correct caret placement.

## Empty editor caret and empty paragraphs

The Mac editor runs inside Tauri/WebKit. A new empty note must focus inside the first structured paragraph, not after it. If the selection lands after the empty textblock, the first typed character can create a second paragraph and leave a real empty paragraph above the text. That is document structure, not a visual offset.

The correction belongs in editor selection and document normalization:

- When loading a fully empty note, place focus at position `1`, inside the only editable paragraph.
- Treat leading/trailing empty non-aphorism paragraphs as editor-only structure when there is real content elsewhere.
- Preserve one empty paragraph only when the whole note is empty.
- Never solve this with `content`, `&nbsp;`, hidden text, manual `<br>` nodes, or extra stored paragraphs.

This rule must not affect copy/paste, `StructuredNoteDraft`, TipTap JSON, sync, export, aphorisms, references, or published output except to remove editor-only empty paragraphs that were created by a bad caret boundary.
