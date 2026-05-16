# Continuum editor interaction plan

Working notes for the desktop and future mobile editor experience.

## Floating menu

- The current top toolbar should move into a separate menu surface.
- Working name: menu bar, command menu, or editor menu.
- Desktop triggers:
  - Right click / context click inside the editor.
  - `Command+9` on macOS.
- Mobile trigger is still open. It should not assume right click; likely a dedicated editor button, long press, or selection accessory.
- The menu should contain the editor actions that are currently spread across the top toolbar, plus future contextual actions.

## Contextual word tools

When the user right-clicks a word, the editor should eventually support:

- Spelling correction.
- Synonyms.
- Etymology.

Open architecture question:

- Decide whether to integrate an existing dictionary/thesaurus/etymology source or build a small internal service around selected lexical data.
- The decision should account for offline behavior, Spanish/English support, licensing, response speed, and mobile parity.

## References and superscripts

The contextual menu/panel is also a candidate home for:

- Adding references.
- Creating references.
- Applying superscripts.
- Connecting a selected text span to a reference.

Design issue to solve:

- The panel may need to hold many actions without becoming dense or confusing.
- Likely structure: primary row for common formatting/actions, contextual section for word tools, reference section for citation/superscript workflows, and advanced actions behind disclosure.

## Product direction

- Keep the writing surface quiet.
- Move power tools out of the constant top chrome and into a summoned menu.
- Preserve the same underlying TipTap document model across desktop, web, iOS, and Android.
- Any UI decision here must remain compatible with the current structured draft model, references, citations, aphorisms, math, and superscript behavior.
