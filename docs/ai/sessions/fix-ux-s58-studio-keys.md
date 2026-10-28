## 2026-10-28 — Studio keyboard: Tab moves focus, letter keys can be turned off, Esc closes (UX fix S58)

- Tab in the Studio is no longer taken by the shell: it walks the focus. E and the Navigate/Edit button flip the mode; "Blender keys" (Help > Shortcuts) puts Tab = mode back as an opt-in.
- New `src/studio/utils/studioKeyPrefs.js`: two choices kept in the browser (letter keys on/off, Blender Tab). Every bare-character shortcut in `StudioShell.jsx`, `StudioEditor.jsx` and `BoxSelect.jsx` asks it first; modifier shortcuts, Delete and Esc keep working.
- Esc closes Quick Insert, then the help, then the window the focus is in; with a selection the first Esc deselects (the editor's own rule).
- Walking and flying are unchanged (`useWalkNavigation.js` not edited; Move 1 untouched). Wiki entry `studio-keyboard`, help Shortcuts text and `known-fixes.md` updated.
- Still owed: a keyboard walk with a visible focus ring at 1440 and the phone view of the switch (real-browser proof); a visible focus-ring style for the floating panels if the walk shows none; the shell's ? key is off with letters off, so the help is reached by its button.
