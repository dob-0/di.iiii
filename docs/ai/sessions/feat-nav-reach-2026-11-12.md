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

### Review round (2026-11-12, after the first push)

Three readers went over the batch (what it can break, the spec with brand and words, the operator's hand): 19 findings, 3 of them major.
Fixed in the same pull request:

- The member's two requests are settled separately. A failed shelves request no longer throws away the counts, so a lamp project keeps
  its Light door; the page says what did not load in one quiet line, and nothing when "All tools" offers the doors anyway. An answer
  nobody can read still settles the page (flat, the three sure doors, the line): it used to be able to leave a list with no doors and no word.
- An embed stays the flat list it was, and a space that only hands the visitor on to its door asks for nothing more.
- The hosted Light door goes through the app, as the top bar's own link does (`navigateInApp`); a click for a new tab stays with the browser.
- "Pick a project" shows only when there is a card to pick. An empty shelf on the space page says "Nothing on show on this shelf."
  (the page lists what is on show; the Studio list keeps "Nothing on this shelf yet.").
- Guards added: door height under a finger (`hubTouch.test.js`), the words of the member page (`copyVocabulary.test.js` reads the page,
  `doors.js` and `shelves.js`), addresses pinned as literals, Studio's own deck door (`studioRouting.test.js` reads the editor), and
  `test:raw` now runs the space page test (the scope guard named it on the first run on GitHub).

Left for the next batch, each a decision and not a slip: Nodes is offered on a card even where the bar still holds it back (the bar's
rule belongs to the top bar work); the way back differs per door (Perform's Desk and Nodes' Back do not return to the space page);
the strips and shelf headings arrive a moment after the rows; a row without doors gives no reason.

Second run on GitHub: 6 tests of `src/components/surfaceBar.embed.test.jsx` timed out on the space page lane. Its stand-in server has no
`listCollections`, and the review round had moved the reader's name outside the promise, so reading the name threw inside the effect
and unmounted the page ("[vitest] No "listCollections" export is defined on the ... mock"). Each read now starts inside its own
promise, the name included. That test file is the guard: it fails again if the read moves out.

Picture-and-click check on GitHub (`.github/workflows/reach-check.yml`, `scripts/reach-check.mjs`, seed `scripts/seed-reach-check.mjs`): a seeded
space `navtest` (alpha on shelf Show, beta on Archive, `home` the way in) is walked as a member and as a visitor, on a desktop and an iPhone 15 Pro
viewport: the door strip and the shelf order, one click from a Perform door to `/navtest/perform/scene-alpha`, the tool line and the missing own-tool
door on the Studio and Nodes lists, and no strips or shelves for a visitor. One screenshot per step goes to artifact `reach-pictures` with `report.json`.
It is report-only (`continue-on-error`) until after the show on 2026-11-14; remove that line then. By hand, against a stack running with REQUIRE_AUTH=true:
`node scripts/seed-reach-check.mjs --token <tok>` then `npm run check:reach -- --base <url> --token <tok>`.
