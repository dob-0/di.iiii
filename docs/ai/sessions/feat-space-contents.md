## 2026-09-10 — a space shows everything inside it

### The gap, measured

Counted on the owner's own tier before touching anything: **22 spaces, 201
projects, 114 of them reachable by no click from anywhere.** Not junk — every
one had content. 78 sat behind three front pages that nothing linked *to*:

| front page | what it hides |
| --- | --- |
| `br-id-ge/n2-hub` — 116 objects, 63 doors | 63 projects (the whole Notations #2 hub) |
| `wcc/main` — 20 objects, links all ten artists | 9 |
| `dilijan/camp` — a page | 6 |

The remaining ~111 were single leaves: `open/front-room` (163 objects),
`main/di-landing`, `main/privacy`, `main/brand-guide`, `atlas/links` (1.2 MB),
and so on.

The cause is one line of schema: a space has **one** door,
`spaces.publishedProjectId`, and that door was the entire public surface of a
space. Everything else in it had no address a person would ever click.

Owner, 2026-09-10: *"there are still open gaps by example some projects i cant
see fully … we need full visibility of our every layer"*, then *"ok i want to
fix that gap so go work"*. The shape he approved: **a space should show
everything inside it, and each thing should say whether it is a scene or a
page — using the setting di.iiii already has, instead of asking you to pick a
kind at the moment you know least.**

### The address

**`/{space}/projects`.** No new word, no new reserved segment.

That address already existed. It was added on 2026-08-21 as one of the "layered
addresses", for exactly this reason — *a space's projects belong to the SPACE,
not to whichever tool you happen to be holding* — and then it rendered Studio's
own hub behind Studio's own gate. So the one address in the product that named
what a space holds answered a visitor with a login wall, and it was the door
that should have led to those 114 projects.

Studio's hub keeps `/{space}/studio`, which is what every existing link already
uses. `buildSpaceProjectsPath` keeps its name and its callers ("back to
projects" out of both editors) — an author who leaves the editor now lands on
the space's contents with one click into Studio, instead of on Studio's hub
wearing the space's address.

`/raw/projects` and `/studio/projects` are each lane's own space-less form and
are untouched: the parser refuses a reserved first segment, so neither can ever
be read as the contents of a space named after a tool.

### What decides that something is a scene or a page

`presentationState.mode` — `scene | fixed-camera | code` — which already exists
and is what the published surface already obeys.

**No `kind` column was added, and none should be.** A project document carries
`entities[]` and `nodes[]` at the same time and nothing enforces either
(vocabulary.md §"Out of scope", item 3), so a kind written down at creation is
a claim the data cannot keep. The mode is the author's own setting, so the page
reports rather than guesses.

Two words, both already in the dictionary: **Scene** (the 3D place you can be
inside) and **Page** (a published web page). `fixed-camera` is a scene you look
at rather than walk, so it says Scene and adds *one view*.

### Privacy — the constraint that outranked the feature

The fix is about work the owner cannot **find**, never about work someone else
should not **see**. Nothing was widened.

- **Who may look at the space** is decided by the gate that already existed and
  was not touched: `requireReadRole('viewer')` in `serverXR/src/index.js`, which
  lets a public space through and refuses everything else. The client mirrors it
  with the same `useSpacePublicFlag` hook `SpaceSurfaceRoute` and
  `RawSurfaceRoute` already use, so "public" keeps meaning one thing.
- **What is on show inside it** is a new, narrower filter in
  `GET /api/spaces/:spaceId/contents`: `state === 'live'` only, so a **draft**
  and an **archived** project are never listed, plus the pre-2026-09-10 legacy
  form of archiving (a title starting `[archived]`), which StudioHub reads
  client-side and a visitor's copy must not. Trashed rows never appear —
  `listProjectsInSpace` already excludes them. A **sandbox** is never public, so
  it is never reachable by a stranger at all.
- The author's own `GET /api/spaces/:spaceId/projects` is **unchanged**: filing
  needs every row, and that is what Studio is for.

Both facts are guarded, and both guards were watched failing first — see below.

### The two seams, and the one that is deliberately quiet

- **The `/spaces` card**: one line under the space's name, *Everything inside*,
  on every card the visitor is allowed into. `/spaces` was not redesigned.
- **Inside a room**: a second corner mark beside *Made with di.iiii*, built out
  of that badge's own stylesheet and obeying the owner's 2026-08-23 call about
  it — a mark at rest (~14px, 44px tap target), the sentence on hover or
  keyboard focus, because a published page is somebody's work and a way out must
  not land on top of it. It renders **only when the space holds more than one
  thing**: a room that is the whole of its space has nothing to send you to.
- **`RoomTextLayer`** gains the same link as its last door. That layer is the one
  part of a published page a crawler and a screen reader actually read, and it
  named only the doors the author had placed — so a crawler that found a room
  found nothing else in the space. This is how those 114 become indexable.

### A space that holds one thing

If the only project on show **is** the space's door, `/{space}/projects` hands
the visitor the room instead (`replace`, so Back does not bounce). A list whose
only row is the room you would already be standing in says less than the room
does.

One project that is **not** the door stays on the list: that is precisely the
case this page exists for, because nothing else in the product links to it —
`atlas/links` is exactly that shape.

### Guards, and what they said before the fix

`serverXR/src/httpContracts.test.js` → `describe("a space's contents")`, both
against a server with `requireAuth` **on**, because a guard written against a
local no-auth install proves nothing about the tier the audience is on:

1. *shows a visitor every live project in a public space, and says what each one
   is* — with the route removed: `expected 404 to be 200`.
2. *never shows a visitor a draft, an archived project, or anything in a private
   space* — with the route removed: `expected 404 to be 200`; and with the route
   present but the state filter replaced by `filter(() => true)`:
   `expected [ 'put-away', 'not-finished', 'older-still', 'on-show' ] to deeply
   equal [ 'on-show' ]`. The private space answered 401 either way.

`src/pages/SpaceContentsPage.test.jsx` — with `kindOf` pinned to one label and
the pretty-link branch forced off: *makes every thing on show a link…* and *says
whether each thing is a scene or a page* both failed.

`src/utils/spaceRouting.test.js` — the address parses, round-trips, and never
reads `raw`/`studio`/`spaces` as a space.

### Reach, before and after

Counted directly against the tier's own database on the day (the tier had
drifted slightly from the brief's figures by then — 24 spaces, 201 projects not
in the trash, **195** of them live and on show):

| | reachable from a space page |
| --- | --- |
| before | **20** — one door per space, and nothing where no door was set |
| after | **195** — every live project, two clicks from `/spaces` |

The brief's "87 before" counted transitive reach as well (a door, plus whatever
portals inside that room happened to point at). The 20 above is the stricter
figure: what a page in di.iiii actually linked to. Either way the 114 that no
click reached are now on a list.

### Files

| file | why |
| --- | --- |
| `serverXR/src/routes/projectRoutes.js` | `GET /api/spaces/:spaceId/contents` — live-only rows + the mode, cached on (project, version, updatedAt) |
| `serverXR/src/httpContracts.test.js` | the two guards |
| `src/pages/SpaceContentsPage.jsx` · `spaceContents.css` · `.test.jsx` | the page, its stylesheet, its guards |
| `src/styles/spine.test.js` | the new stylesheet joins `SPINE_FILES` |
| `src/utils/spaceRouting.js` · `.test.js` | `APP_PAGE_SPACE_CONTENTS`, the parser, the builder |
| `src/studio/utils/studioRouting.js` · `.test.js` | Studio stops claiming `/{space}/projects` |
| `src/RootApp.jsx` | `SpaceContentsRoute`, dispatched before Studio's |
| `src/components/SpaceContentsBadge.jsx` · `madeWithBadge.css` | the corner mark in a room |
| `src/hooks/useSpaceContentsCount.js` | the number that decides whether to offer it |
| `src/project/components/PublicProjectViewer.jsx` · `RoomTextLayer.jsx` · `.test.jsx` | the seam inside a room, and the reader's door list |
| `src/studio/components/SpaceHub.jsx` · `studio-space-hub.css` | the seam on the `/spaces` card |
| `src/project/services/projectsApi.js` | `listSpaceContents` |
| `src/wiki/wikiContent.js` | the new article, and `/{space}/projects` re-described |

### Left open

- The author's index `GET /api/spaces/:id/projects` still returns drafts and
  archived rows to an **anonymous** visitor on a **public** space. Pre-existing,
  untouched here on purpose — narrowing it is a contract change to an endpoint
  the sync scripts also use — but it is the reason the contents page has its own
  route rather than filtering the author's one in the browser.
- `/spaces` still shows one card per space with no count on it. A count would
  want the contents call per card; not worth it against twelve booting previews.

### Looked at, not just tested

A production build served from a throwaway serverXR on :5231, pointed at a
**copy** of the local tier's data (the owner's own tier was never written to),
`REQUIRE_AUTH=true`, driven by headless Chromium in a **clean context with no
token and no cookie** — the weakest session that has to work. Desktop
1440×900 @ DPR 2 and a Pixel 7. Shots in the session scratchpad's `shots/`:

- `desk-wcc-contents.png` / `phone-wcc-contents.png` — all ten WCC artists
  listed. Before this, `wcc/main` was the only one a click reached.
- `desk-br-id-ge-mid.png` — 69 rows, Scene and Page rows side by side, the
  door marked `THE WAY IN`.
- `desk-atlas-private.png` — a private space, no token: the product's own
  restricted card. No project name appears in the page or the response.
- `desk-single-project-redirect.png` — `/beyond-form/projects` lands on
  `/beyond-form`. The list of one never renders.
- `desk-spaces-card-seam.png` — *Everything inside* on every card.
- `desk-room-badges-rest.png` / `desk-room-badges-hover.png` — the two corner
  marks at rest, and the second one unfolded to
  "▤ Everything in this space — 23".
- `phone-room-badges.png` / `phone-room-to-contents.png` — the tap target
  measures exactly 44×44, and the tap lands on 23 rows.

The reader's copy was checked in the DOM, not assumed: `.room-text-layer nav`
ends with `Everything in this space` on `/open`, `/?room=1` and `/dilijan`.
