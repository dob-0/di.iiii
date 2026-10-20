## 2026-10-15 — Studio: deselect after a lock, and the stale-state sweep (N581)

- The reported bug ("select a model, finish, and you cannot deselect it") reproduced in a real browser as a pair of stale states:
  the outliner padlock locked the object but left it selected (L and the Inspector's Lock drop it), and X/Y/Z on that selection
  armed `transformOp` for an operator the viewport never mounts — nothing cancelled it, so Escape, A, Alt+A, Delete and the gizmo
  were dead for the rest of the page. Only a click on empty floor still cleared the selection. Fixed at all three places: the
  editor drops a locked object from the selection whichever control locked it and arms a transform only when something can move;
  the shell asks the same before X/Y/Z; the viewport cancels an op it will not mount an operator for.
- Swept the rest of the class in the browser (13 sequences: G/X finish by click, Enter and Escape; the gizmo drag; Edit ↔ Navigate;
  the Select tool; a B box; the outliner; an orbit; walk mode; the phone's tap) — all deselect. Three more stale states found and
  fixed with a red-then-green test each: a right-drag pan deselected (R3F counts `contextmenu` as a miss, and Linux fires it on the
  press); B then a click left the box armed for the next drag; Enter/Escape in an Inspector number field kept the focus, so no
  shortcut worked after typing a value.
- Not fixed, named in the PR: the modal transform's finishing click is swallowed before R3F sees its pointerdown, so R3F's click
  distance for that one click is measured from the previous press (harmless unless the finishing click lands within 2 px of it);
  a right-click without a drag on empty floor deselects on Windows/macOS (contextmenu fires on release there), which reads as a click.
- Wiki `studio-basics` updated (locked objects leave the selection; how to deselect; B ends on a click; Enter/Escape leave a field).
- Still owed: the owner's exact "finish" step is a guess (the padlock and X path matches every symptom, but the report named no
  control); a model-covering-the-viewport case has no empty floor to click — Escape and Alt+A are the way, and both work now.
