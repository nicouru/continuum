# Editor context menu

Interaction rule:

- Right click anywhere on the editor surface opens the Continuum editor menu,
  including an empty note before there is visible text.
- The native macOS/WebKit context menu is suppressed on the editor surface.
- `Command+9` also opens the Continuum editor menu.
- Right click on a note in the sidebar opens the note menu. In the main list
  this menu includes `Enviar a papelera`, with the trash icon, and can remove
  the last remaining note.

Anything that changes editor content permanently should move through Continuum
actions, so citations, references, segments, aphorisms and inline math stay inside
the structured draft model.
