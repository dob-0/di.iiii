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

- `npm run lint` (0 errors), `npx vitest run` on every touched test, `npm run test`.
- A dev stack on ports 4330/5330 with a throwaway DATA_ROOT, driven with Playwright at
  1440×900 and 390×844 DPR 3 — screenshots in the worktree's `.verify/` (not committed).

### Not done here

- Studio's own `← Projects` (`StudioEditor.jsx` `onBackToHub`) still goes to `/{space}/projects`,
  the visitors' list — same bug class, the Studio side. Not in this item's brief.
