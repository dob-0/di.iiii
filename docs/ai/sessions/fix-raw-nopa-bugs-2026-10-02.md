## 2026-10-02 — Nodes keeps its cards on screen; selecting a card no longer writes to the project

Fixes from the NOPA bug hunt (di-atlas-nopa `audits/2026-10-02-raw-nodes-nopa-bugs.md`), measured
before/after with Playwright on a scratch copy of the NOPA project (8 cards), 0 page errors.

- **F4 selection is per viewer** (`utils/localSelection.js`, `RawEditor.jsx`): the selection half of
  every op batch is held in editor state and only the rest reaches `useProjectDocumentSync`. A card
  click sent 1 `POST /ops` (`setWorkspaceState {selectedNodeId}`) before, 0 after; a whole run of
  select + four List opens + Escapes sent 5 before, 0 after. A `selectedNodeId` an older client left
  in the document is ignored. Studio's graph already kept selection in component state.
- **F1 resize** (`RawGraphSurface.jsx`): a view untouched since its last fit fits again; a view moved
  by hand keeps zoom and the graph point in the middle, and fits only if no card is left on screen.
  2560→1200: 2/8 cards on screen before, 8/8 after (76%). Pan then resize: 2/8 → 5/8 inside, 7/8 touching.
- **F2 load** : a first fit that never ran (canvas had no size) runs on the first resize; cards that
  arrive after the fit, all off screen, are fitted while the view is untouched. Far pan then resize: 0/8 → 8/8.
- **F3 Fit button fits everything** (Figma Shift+1 / TouchDesigner Home): phone 390×844 6/8 inside
  at 34% before, 8/8 at 22% after. Automatic fits keep the 34% floor and the "showing N of M" notice.
- **F5** `.raw-window-stack` is `box-sizing: border-box`: pane ran 24–32px past the body; now 0, last row reachable.
- **F8** coincident windows cascade 32px in document order (`utils/windowCascade.js`); Escape (capture
  phase, yields to `defaultPrevented`) closes the front window the person opened or raised.
- **F9** the toolbar names the project when the bar above names the space.
- **F11** the teal stripe was the selection sheet collapsed to its 2px border: a List has no inspector
  sections and the empty message used the canvas's absolutely placed `.raw-empty-state`. The sheet now
  keeps its header and an in-flow note.

Not changed: F6 (List covering zoom/Fit) and F7 are PR #729's; F12 is #729 behaviour. F10 (Delete
FAB beside the corner) has no single cause; on a phone it overlaps an open window's bottom-right — owed.
Guards: `localSelection.test.js`, `windowCascade.test.js`, `RawGraphSurface.viewFit.test.jsx`,
`styles/windowPaneFits.test.js`, new cases in `RawEditor.test.jsx` and `PropertyInspector.test.jsx`.
