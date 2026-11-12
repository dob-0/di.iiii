## 2026-11-12 — reach batch 2: Nodes on the bar at space level opens your last project

Owner N3986 (2026-11-12 05:54), a yes to "'Nodes' on the bar at space level opens your last project straight away"; ledger
N3851.19; origin N3851, "for reaching this UI i need to do many steps". Branch `feat/nodes-last-project-2026-11-12` from dev
`fadc30a90` (batch 1, PR 1278, merged). No top bar item or order change (that waits until after Saturday, N3986).

### What it does

On a surface that has a space and no project (today: the space's own page), the bar's Nodes opens the project the person last
stood in inside THIS space (`buildRawProjectPath(last, space)`). Otherwise the list, as before.

### Decisions

2. **Per device, not per tab.** The last project of each space is kept in localStorage (`dii.lastProjectBySpace`, ids only, one
   per space, the newest kept, at most 50 spaces), with the tab's sessionStorage as the fallback when localStorage is
   blocked. Why: the owner works in many tabs on one laptop and a new tab should open the project too (the lead's advice);
   nothing private is stored (ids, no titles), and a blocked storage only returns the old behaviour. Keyed by space so one
   space's project is never opened under another. Tools and Wiki keep reading the tab's `readLastProject` and their
   behaviour is unchanged: they put the last project into the bar, which already made Nodes open it.
3. **A deleted or renamed project falls back to the list.** `SpaceContentsPage` passes `knownProjects` (the ids of the
   space's own list) once the space has answered; a remembered id not among them gives the list. A renamed TITLE changes
   nothing (the id is the key); a changed ID is a missing project. Before the page has answered, the jump is optimistic.
   What Nodes' editor shows for a missing project, read from code: the overlay `loadError` (the server's message, or "Failed
   to load project.") on an empty canvas, and the bar with the ⋯ menu's "Projects" button as the way out. Not pictured.
4. **On the Nodes list itself the bar's Nodes does not jump.** Decision: when `here` is `raw` the bar keeps the list.
   Why: it is the Nodes surface's own picker; a jump from the picker to a project the person may have just chosen not to
   open would trap them. Today the list (StudioHub, `/<space>/raw/projects`) draws no top bar at all, so this guards a
   future bar on the hub (batch 1 listed one as later work) and the bare Nodes canvas with a space.
5. **The list stays reachable without the bar's Nodes.** Paths, checked in code: (a) the Nodes editor's "Projects" button
   in its ⋯ menu (`RawEditor.jsx`, `buildRawProjectsPath`); (b) the Studio list's "Nodes" button (`StudioHub.jsx`, `tool.other`);
   (c) the address `/<space>/raw/projects`. The space page lists projects itself, each with its doors.
6. Out of scope and untouched: Studio's bar link, any new top bar item or order.
7. **REG-3 stays OPEN, for the owner to pick after Saturday.** "Nodes is offered on cards while the bar holds Nodes back."
   This batch does not change when the bar shows Nodes. What the jump does meanwhile: Nodes is held back by the layers rule
   only INSIDE a project (`surfaceDestinations` filters on `inProject`); at space level the bar always shows Nodes, so the
   jump takes the person to a project's Nodes editor even when that project has not reached the connections layer, where
   the bar then shows Nodes because "the surface you stand on is never taken off the bar". So cards and the jump already
   agree with each other; the disagreement is only inside a project. Two ways to make cards and bar agree:
   (A) the bar always shows Nodes inside a project (as cards do) — simplest, bigger bar for new projects;
   (B) cards and doors hide Nodes until the connections layer (`layerReached('raw', layers)`) — keeps the bar as designed,
   but removes a way in for a new project.

### Rules

1. The bar's space-level Nodes is decided in ONE place, `nodesAtSpaceLevel` in `SurfaceBar.jsx`; the memory is read only
   through `readLastProjectOf` in `lastProject.js`.
2. A remembered project is never opened for another space.
3. The jump never fires on the Nodes surface.

### Tests

`SurfaceBar.test.jsx` (this space, another space, nothing remembered, project gone, on the list, inside a project, Tools and
Wiki), `lastProject.test.js` (device memory, newest wins, blocked storage, 50-space cap, damaged value),
`SpaceContentsPage.test.jsx` (the page passes its ids). The reach check gains steps f (a member opens alpha in Nodes; in a
new tab the space page's Nodes opens alpha's Nodes) and g (a remembered project that is gone: the list).
