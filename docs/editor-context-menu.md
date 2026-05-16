# Editor context menu

Temporary interaction rule:

- Right click on the editor keeps the native macOS/WebKit context menu available.
- `Command+9` opens the Continuum editor menu.

This is intentional for now. The native Apple menu is useful while we decide which
system functions are worth recreating inside Continuum with TipTap-safe commands.
Anything that changes editor content permanently should eventually move through
Continuum actions, so citations, references, segments, aphorisms and inline math
stay inside the structured draft model.
