## 2026-09-03 — network space grows to all 52, three pages, three.js vendored once

- Wired three finished pages and 52 generated rooms into `spaces/network/`:
  - `spaces/network/people.json` — was 8 people (the team + a few with rooms
    already), now all 52 from the sourced roster (`network-directions/data/inventory.json`),
    wrapped in the existing `{note, people}` shape. `works` items now carry
    `{url,title,line,space,project}` (was `{href,title,line}`) — this is the
    shape `room-template.mjs`'s `renderRoom()` and `lib/room-content.mjs`
    actually read (`w.url`, not `w.href`); a null `url` renders as an
    unlinked door instead of a link. Two works — `azd` and `br_id_ge` — are
    shared by more than one person; that's what draws a line between two
    nodes in a room's field.
  - `spaces/network/room-template.mjs` + `spaces/network/lib/` (css.mjs,
    room-content.mjs, neighbors.mjs, field.client.js) replace the old
    build's inline `page()` — copied from the finished MIX build, with
    three.js loading changed to vendored/root-relative (see below).
  - `spaces/network/build.mjs` now calls `renderRoom(person, people)` per
    person instead of its own template, and generates all 52 pages +
    manifests. Dropped the old `roster.includes(...)` integrity check
    (compared against `code/index.html`, which no longer lists doors that
    way) — every person in `people.json` gets a page by construction now,
    so the check is just "the loop wrote one file per person".
  - `spaces/network/code/index.html` — the roster page — is now the MIX
    build's catalogue-plus-living-field page (was the old flat two-tier
    list).
  - Two more static pages, each its own project: `network-constellation`
    (`spaces/network/pages/constellation.html`, "The Constellation" — the
    field as the whole page) and `network-index`
    (`spaces/network/pages/the-index.html`, "The Index" — a dense
    printed-catalogue read with thumbnails, no three.js).
  - `spaces/network/di-space.space.json` — `projects` lists all 55
    manifests (index + 2 pages + 52 rooms); `note` rewritten for the new
    reality.
- **Vendored three.js once** instead of inlining it into every page:
  `public/vendor/three.core.min.js` + `three.module.min.js` (copied from
  `node_modules/three/build/`, matches the `draco/`/`fonts/` precedent —
  `npm run build`'s default (non-local) profile copies `public/` wholesale,
  so no include-list change was needed). Every page that used to inline
  three.js via a blob-URL import map (~700KB tax per page) now does
  `import * as THREE from "/vendor/three.module.min.js"` (root-relative —
  resolves fine from a code page's `srcdoc` frame, and three.module's own
  relative `./three.core.min.js` import resolves against it for free, no
  bare-specifier rewrite needed). Sizes: `code/index.html` 801KB → 52KB,
  `pages/constellation.html` 791KB → 40KB, a room page ~600KB → 24KB.
  `pages/the-index.html` never inlined three.js (it embeds base64 JPEG
  thumbnails instead) — stayed at 292KB; out of scope for this change.
- Ran `node spaces/network/build.mjs` twice and hashed `pages/*.html` +
  `di-space.*.json` before/after the second run — identical, confirmed
  idempotent.
- Validated: `npm run lint` (0 errors, 61 pre-existing warnings elsewhere),
  `npm run test` (359 files / 3402 tests, all pass), `npm run build`
  (green, `dist/vendor/` present).
- Looked at it: served the repo with `public/` mounted at `/` (so
  `/vendor/` and `/fonts/` resolve) and screenshotted the roster and two
  rooms (syuzi-ginosyan — has works; taron-grigoryan — empty room) at
  desktop 1440×900 DPR2 and phone 390×844 DPR3. Confirmed three.js loads
  from `/vendor/` with no console errors and the living-field canvas
  renders on all six shots.
