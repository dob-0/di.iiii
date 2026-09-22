## 2026-09-23 — one project list per space: Nodes' own front door retired

Wave 1 item 5 of `di-atlas/decisions/2026-09-23-connect-everything.md`. Owner's words:
the Nodes list "is like a separate line not connected to the system … it would be better
to start with layers, so you create 1st something and things one by one, not flood things
there".

- `/{space}/raw/projects` keeps its address (no redirect) and now renders Studio's hub,
  `StudioHub openIn="nodes"`, from `src/raw/RawApp.jsx`. Same cards, same shelves, same
  drafts / archived toggle, rename, state, trash, Admin, Import, View live and Spaces as
  `/{space}/studio`. What differs: a card, Latest and New open the node canvas; New makes a
  project with source `raw-v2` (its card says "Nodes"); the top-right cross button reads
  **Studio** (to `/{space}/studio`) where Studio's copy reads **Nodes**; the open space's
  forward into the jam happens only on Studio's copy.
- RawEditor's `← Projects` goes to `/{space}/raw/projects`. It went to `/{space}/projects`,
  the visitors' contents page since 2026-09-10, where drafts do not show and a card opens
  the viewer.
- Removed: `src/raw/components/RawHub.jsx`, `RawHub.test.jsx`, `GUIDE_AUDIENCES` in
  `src/raw/utils/rawGuide.js` (and its test case), the help dialog's two audience cards,
  and every `.raw-hub*` / `.raw-project-list` / `.raw-help-audience*` / `.raw-help-chip*`
  rule in `raw.css` that only they used (~350 lines). `rawGuide.js` stays: the help dialog
  still reads `GUIDE_SECTIONS`.
- Words made true: `src/raw/AGENTS.md` (the landing does NOT open on the node canvas; the
  projects page is StudioHub), `wikiContent.js` `spaces-and-projects` (the two "older
  address" lines — same wording as the parallel `docs/sentences-that-lie` branch, so the
  two merge without a conflict) and `raw-lane` (the list line), `README.md`'s lists line,
  and comments that named RawHub (serverXR routes, asset-remap-lib, studioNode, the enter-node
  handoff, WikiPage, the embed test).

### What RawHub offered that StudioHub lacked — one decision each

| RawHub had | Decision | Why |
| --- | --- | --- |
| "First Landing / Choose a path" + "For Visitors · Look first" / "For Creators · Build small" cards | **Gone** | The flood the owner named. StudioHub's empty state already says "A project is one thing you build and publish" with one button. |
| "Workflow · Space → project → publish" card | **Gone** | Same. |
| Title box + `new project` | **Gone** — StudioHub's `+ New project` (asks the name, then lands in the node canvas) | One way to make a project, the same on both lists. |
| `import` | **Kept** — StudioHub's Import, identical handler (source `legacy-import-studio`, card says "Imported"); it now opens the import in the tool of the list you are on | The brief: import of an old scene stays identical. |
| "open the Studio node" (find-or-create `studio-node-<space>`, land inside the container) | **Gone** | The plan's own "not doing": Studio as a node inside Nodes — the bar makes the two editors one project. An existing `studio-node-*` project stays on the list as an ordinary card; the Studio node is still in the palette. `rawEnterNodeHandoff.js` and RawEditor's reader are left in place with no writer (comments say so) — removing them is a RawEditor edit this PR did not need. |
| `SpaceSyncPanel` (↓ get latest / ↑ publish to live) | **Kept, Nodes copy only**, passed as `children` from RawApp; draws nothing unless the server has `LIVE_API_URL` configured — exactly as before | Operators use it on local installs and this page was its only home. No new chrome: on an ordinary install both lists are pixel-for-pixel the same. Its row now carries its own top edge and a gap (it used to borrow the old list box's). |
| Footer `studio` / `public` / `admin` | **Folded into StudioHub's own**: the cross button says Studio; View live is public; Admin (admins only) | Same destinations, no second row. |
| Import warnings box | StudioHub shows warnings in its status line | Already the case on Studio's list. |

### Checked

- `npm run lint` (0 errors), `npm run docs:ai:check`, `npx vitest run` on every touched test,
  and `npm run test`: all green once `serverXR` had its own `npm ci`. Two server tests
  (`followIntegration` "byte for byte", `configRoutes` "repeats what index.js says") timed
  out under full-suite load and pass alone. The `← Projects` guard was run against the old
  path first and failed.
- serverXR on 4330 and vite on 5330, with a throwaway DATA_ROOT, walked with Playwright at
  1440×900 (DPR 2) and 390×844 (DPR 3), 18/18 checks passing:
  `/lab/studio` and `/lab/raw/projects` list the same cards on the same shelves (Show one:
  Pulse, Wall study; Not on a shelf: Draft sketch) and differ only in the Nodes ↔ Studio
  button. Neither page has a First Landing / Build small / Space → project → publish card.
  A card opens `/lab/raw/projects/draft-sketch` on the canvas. `← Projects` comes back to
  `/lab/raw/projects` with the DRAFT card showing. New lands on an empty canvas at
  `/lab/raw/projects/first-…` and shows up on Studio's list with a "Nodes" badge.
  `/lab/seed/projects` heals to `/lab/raw/projects`. With `LIVE_API_URL` set, the sync row
  shows under the Nodes list only; the Help dialog no longer has the audience cards.
  Screenshots are in the worktree's `.verify/`, which is not committed.

### Seen on the way, not changed here

- Studio's own `← Projects` (`StudioEditor.jsx` `onBackToHub`) still goes to `/{space}/projects`,
  the visitors' list. It's the same bug class on the Studio side and wasn't in this item's brief.
- On a phone the Help dialog squeezes its left panel to a ~40px sliver. `raw.css`'s
  `@media (max-width: 900px) .raw-help-body { grid-template-columns: 1fr }` sits BEFORE the
  base `.raw-help-body` rule, so the base rule wins at every width. The order is the same on
  `dev`, so this didn't start here. It's one small move of that rule and wants its own PR.
- A brand-new project opens zen (no toolbar), so it has no `← Projects` until the palette
  brings the toolbar back. This is the node editor's existing empty-project behaviour.
