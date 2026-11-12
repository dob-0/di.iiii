## 2026-11-12 — nav reach, batch 1: doors on the space page and hub cards, shelves, a named picker

The reach audit of 2026-11-12 found 66 places where a person could not get from a project to the tool they wanted, or where
two surfaces gave different ways to the same place. This batch is the additive part: it only adds. No address changes, no top
bar order change, and a visitor (not a member) gets exactly the page `origin/dev` renders, with no extra request.

Three root causes, three fixes:

- The deck took 3 to 5 clicks. A member's space page and the hub cards now carry a strip of doors under each project:
  Perform, Studio, Nodes, and Projection and Light when the project holds them (`src/project/doors.js`). Studio's own deck
  door no longer forces a layout (`buildStudioDeckPath` in `src/studio/utils/studioRouting.js`: only `from=studio`; a show
  default or the last used layout wins, and a fresh device still gets the VJ layout through `src/perform/presets.js`).
- Nodes at space level opened an unnamed list. The hub (`src/studio/components/StudioHub.jsx`, also the Nodes copy of the
  list) now says "Pick a project. A card opens it in Studio." or "...in Nodes.", and marks the card of the space's way in.
- The space page was a visitor page with no doors or shelves. For a member (`canEdit`) `src/pages/SpaceContentsPage.jsx`
  adds the strips and, when the space has shelves, groups the rows under shelf headings (`src/project/shelves.js`). A second
  effect loads the member data after the contents; the main load effect is as on `origin/dev`.

### Rules (do not break them in a later batch)

1. Doors come from ONE function, `projectDoors`; a list row is read by ONE function, `doorsForListRow`; counts become open
   layers by ONE rule, `openLayersFromCounts` in `src/project/layers.js`. Addresses and words come from the top bar's
   `surfaceDestinations` in `src/components/SurfaceBar.jsx`, never retyped.
2. A door never names a layout: no `preset=` in a door's address.
3. A page-type (code) project gets no doors, on the space page and on a hub card.
4. A visitor's page is unchanged: no strips, no headings, no extra request.
5. No address change, no bar order change, no data change. Undo is a revert of the merge commit.
6. Rows of the project list carry counts (`layers`) and no `mode`; only the contents rows carry `mode`. Read a row only
   through `doorsForListRow`.

### What waits for a later batch

- The top bar adopting the same function, so its doors and the strips can never differ.
- Dimming a door with a reason instead of hiding it.
- A bar on the hub.
- A project switcher.

### Not verified when this note was written

Nothing was run on the laptop that wrote it (tests, lint and the style suites run on GitHub and a Colab box), and no
picture was taken. Whether five doors wrap cleanly at 390 px is computed, not seen: `npm run verify:surfaces` owes
screenshots at 1440 px and 390 px, member and visitor.
