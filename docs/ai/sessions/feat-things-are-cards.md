## 2026-09-23 — every thing in the room is a card in Nodes (layers units 4, 6, 7)

Units 4, 6 and 7 of di-atlas `decisions/2026-09-23-layers-what-inside-what.md`. Question 2
(a thing inside a Geo) is open, so unit 8 is not built and no thing's parent ever names a node.

**Built**

- **Unit 4 — grouped things stand where Studio shows them.** Seen first, on a fresh local stack:
  three Studio boxes, two grouped, the group moved to x 2.5 — Studio showed the pair on the right,
  Nodes' room showed it in the middle, sunk to the floor. `RawViewport` now draws each thing inside
  its group's transform, as `StudioViewport`'s `SceneEntityNode` does. The tree is read once in
  `src/project/entityTree.js` (a thing whose group is gone stands at the top; a cycle is never
  walked). Same component, so `/out`, `/make` and the published page (once a node exists) follow.
- **Unit 6 — things are cards in Nodes.** `src/raw/utils/objectCards.js`, re-applied from
  `8c58c29a` on `worktree-connect-graph-walk` with grouped things KEPT (they stack under their
  group's card, one step in). Nothing else came from that branch. Every thing is a card and an
  outliner row (a tree); clicking a card selects the thing and its inspector opens; the count reads
  "N nodes · M things" (one number under 640px, the breakdown in its aria-label); a project of
  things opens on its cards with its toolbar. Card positions are worked out each render, never
  saved. A thing can be dragged in Nodes' room: a local preview while held, ONE `updateComponent`
  edit on release (Studio's gizmo edit), none if it did not move or the pointer was cancelled;
  pressing any part of a group moves the group; a thing locked in Studio stays.
  `emptyCanvasHint.js`, its test and the "See the room" button are retired.
- **Zen** counts things as well as nodes and decides the derived default only once the project has
  loaded — the store now says so (`hasLoaded` in `src/project/state/projectStore.js`, set by
  load-success). A zen somebody chose applies at once.
- **Unit 7 — add a thing from the Nodes palette.** A "things" group from `entityPalette.js` (the
  15 Studio's Add offers), right after "make" when browsing, after the nodes when searching; it
  makes the thing through the existing add path (`handleCreateEntity`). The Cube, Sphere and other
  shape nodes stay. The status line says where it landed ("Box added to the room." / "… added to
  the top room — a thing cannot stand inside Geo yet."); Nodes shows no activity list, so it is
  also the activity message.
- **Found by looking, fixed here:** placing the first node moved every thing card off-screen (the
  band was "below the lowest node") — the band now stays at the origin unless a node stands on it,
  and new palette nodes step aside from it; on a phone the landing line sat under the selection
  sheet — it now rides the sheet's measured inset.

**Proven** (own stack on 4390/5390, fresh data root; Playwright Chromium at 1440×900 DPR 1.5 and
390×844 DPR 3 touch; screenshots in the worktree's untracked `.verify/`, every one opened)

- Unit 4: `unit4-before2-*.png` against `unit4-after-*.png`, and `/out` (`unit4-out.png`).
- Unit 6: three boxes, two grouped → four cards (three boxes and the group, two stepped in), the
  outliner a tree, "4 things"; phone shows "4" and no sideways scroll. Drag, desktop: 30 pointer
  moves held → project version 12 → 12; release → 13; Studio in a second tab showed the move with
  no reload; Ctrl+Z → 14 and the position back exactly. Phone touch drag: 53 → 53 held → 54.
- Unit 7: box, sphere (its "a thing" row) and lamp each +1 thing and each in Studio's Objects list
  in the other tab with no reload; a Cube node after them left every card in place; four undos
  → 7 → 6 → 5 → 4 things. Phone: the palette's things group, a box added by tap.
- Topbar with both kinds at 1440/900/700/390: no overlap, nothing past the edge, ⋯ whole.
- Every new guard was seen red on the old code: the grouped-thing drawing, the two zen cases, the
  same-render load, the chosen zen, the step-aside.
- `npm run test`, `CLIENT_DIR= npm run test:server-contracts`, `npm run lint` (0 errors),
  `npm run docs:ai:check` — results in the PR.

**Owed**

- Not yet on his surfaces: nothing was packed onto his install or opened on the S24 (the decision's
  verify step for every unit). The published page on the S24 (unit 4) and `/make` were not looked at.
- For the owner: a name that is both (Sphere, Plane, Text) still places the NODE on Enter and the
  thing is the row below — kept so type-to-place never changes; "lamp" finds the point light.
  The new word "thing" sits beside `docs/ai/vocabulary.md`'s "object" and Studio's "Objects (4)".
- The room drag has no unit test: jsdom has no R3F `event.ray`. It is proven by the version counts.
- A node made by dropping a file or by the examples does not step aside from the thing band; if it
  lands on it, the band moves below the nodes (no overlap, but a jump).
- A new thing's card can land outside the view (no re-fit, by the one-fit rule); the line says so.
- Seen, not mine: the phone count button is 12×13px (the same number-only button as before); the
  phone SurfaceBar clips "PROJ…"; the inspector prints long floats (-0.37499999999999983).
- `hasLoaded` is there for the layers agent's "Studio opens bare … once the project has loaded".
