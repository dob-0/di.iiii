## 2026-10-28 — Space: going public asks first; Delete stands apart (UX fix S04)

- Builds on S01 (`feat/ux-s01-ask-undo`, PR #1167): uses `useAsk` and `useUndoNotice`.
- Manage on a space card is grouped: Name · Who can see it · Invite people · History and backup · More (folded: Own domain, Link project, Preview, GitHub sync) · Put away (Archive) · Delete, last, on its own line under a rule. Labels 12 px, normal letters (owner Q1 default A); buttons 32 px, a finger (44 px) under a coarse pointer.
- "Public"/"Private" is now a `role=switch` "Anyone with the link can see it", On/Off in words, with a line on who sees the space (`src/studio/utils/spaceVisibility.js`). Going public asks (names the space, "Make it public" / "Keep it private"); going private does not. A failure shows in the page notice (`role=status`), not `alert()`. The map view's "Make public" and the "Not public" warning's button share the same handler, so they ask too.
- One delete: `useSpaceDelete` in `SpaceTrash.jsx`, used by the Spaces page and the admin Directory. Same box, then a notice "“Name” is in the Trash for N days." with Undo (restores from the Trash). The admin project delete asks in the di.iiii question box.
- Native-dialog budget 112 → 109.
- Not done: `useSpaceActions.handleDeleteSpace` (old editor space list) keeps its `window.confirm` and `alert()`s; the admin Directory's own Public/Private button still flips in one click; the children's lab lock on the switch is S30.
