## 2026-10-02 — Director keys act only with focus inside the panel

- Space, Left/Right (+Shift), Home and B in the Director panel were handled on `window` whenever the panel was mounted, stealing them from the node canvas. They now act only while keyboard focus is inside the panel (the panel section takes focus on click, `tabIndex={-1}`); text-field guards are unchanged.
- Ctrl/Cmd+Z/Y: `useEditHistory` takes an optional `scopeRef` and, when given, acts only with focus inside that element, in the capture phase, calling `preventDefault`. The Director window passes its own element; AlgoVrithm keeps the unscoped behaviour.
- RawEditor's undo/redo branch skips events that are already `defaultPrevented`, so one Ctrl+Z undoes either the Director or the graph, never both.
- Tests: `src/raw/director/DirectorPanel.keys.test.jsx` and one case in `src/raw/components/RawEditor.test.jsx`. Owed: a look in a real browser (not run on this machine).
