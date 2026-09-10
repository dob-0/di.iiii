## 2026-09-10 — Emily's two lost WCC versions, recreated as draft projects on local

The owner was looking at the `wcc` space in Studio and asked for Emily's two removed
versions of the exhibition to exist as projects he can open and walk, side by side with
what is live. Both were real commits, both were reverted. Recreated on the LOCAL tier
only (`https://local.thedi.studio`) — no writes to staging or production, `main` left
untouched.

- **`wcc/emily-v1-framed-entry`** (state `draft`) — a full copy of `main`'s document
  (all 20 hub/zone entities, unchanged) with an authored opening shot. Her commit
  `5a644003` computed the camera from an entity named "Entrance – Threshold gate" via
  `buildEntryCamera(doc)`: `position = [gate.x, gate.y+0.1, gate.z+5.2]`,
  `target = [gate.x-1.2, 1.3, gate.z-8.0]`, `fov 55`. **Today's document has no
  gate/threshold/entrance entity** — the 20 entities are `hub-*` and `zone-*` only. Ran
  her exact formula against `hub-spire-core`'s position (`[0, 0.3, 0]`, the room's real
  centre landmark) instead of inventing a gate, and wrote the result into
  `presentationState.fixedCamera` with `mode`/`entryView: 'fixed-camera'` — the schema's
  existing authored-opening-shot mechanism, so no runtime code was needed to reproduce
  what her `WccExperience.jsx` did by hand. Compared against `main`'s own auto-framed
  default (a wide, elevated, distant look at the whole hub) the new shot is close,
  low, and looks past the beacon into two named zones — a real move in the direction
  she wanted, though it is a repurposed landmark standing in for a gate that no longer
  exists, not literally "through a threshold." The room-colour half of her commit (the
  2D landing's dive resolving into `worldState.backgroundColor` instead of flashing to
  black) lives in the separate `wccSite` microsite's dive transition, not in a Studio
  project document — nothing to author here for it.

- **`wcc/emily-v2-arc-of-panels`** (state `draft`) — a from-scratch scene, not a copy of
  `main`, matching her commit `2b376577`'s `WccExhibition.jsx` (255 lines, since deleted
  by `71e7196a`). Three `image` entities for the only three works her `ARC` constant
  actually held (Meri Andreasyan, Ani Khachatryan, Arthur/Ronin/Jenny — not all ten wcc
  artists), at her exact `ARC` positions, sized to her `PANEL_BASE = 3.4` from each
  image's real aspect, and rotated `[π/2, 0, -ry]` — derived and numerically verified
  (not guessed) so the engine's own upright-image convention reproduces her `Ry(ry)`
  panel normals exactly, confirmed both in the matrix math and in the screenshot (the
  side panels visibly foreshorten toward the centre — the arc reads as angled inward).
  `animation: { mode: 'bob' }` for her per-panel sine drift (`bob`, not `float` — the
  engine's own `float` also spins, which would tumble a flat image out of legibility;
  `entityAnimation.js` says as much). `worldState.backgroundColor`/`fog` set to her
  `#070506` / near(10)/far(30), grid turned off (she had none), opening camera exactly
  `[0,0,22]` fov 50 authored as `presentationState.fixedCamera`. The three stills
  (`meri.png`, `untitled.jpg`, `wcc.png`) still exist at
  `public/wcc/artist-works/**` from her commit — uploaded as real project assets
  (sha256 ids, present on disk) rather than left as raw `public/` URLs, so
  `document.assets` and `npm run assets:audit` both see them (`3 referenced, all
  present`). **Left out, and not faked:** her particle-field `AmbientField` (no
  particle-system entity type in the schema), the `CameraRig` that lerps to a clicked
  panel, and the click-driven red focus frame + dim-siblings treatment — all of these
  are per-viewer interactive/selection state the schema has no slot for. The panels are
  inert; nothing pretends otherwise.

Both projects were created via the space's own project-creation endpoint, then set to
`state: 'draft'` through `PATCH /api/projects/:id/shelf`. Verified directly against the
running local server: `state: draft` drops a project from
`GET /api/spaces/wcc/contents` (what a visitor's `/wcc` and `/wcc/projects` listing
reads) but it still appears in `GET /api/spaces/wcc/projects` (Studio's own, unfiltered,
every-state list) — so both sit in Studio for the owner to open and compare, and neither
is visible to a visitor. Confirmed further that the `wcc` space itself is `isPublic:
true`, so reading either draft project's document by id needs no session at all —
verification below used a plain guest request, the weakest session that has to work.

### Verification

`npm run lint` / `npm run test` (targeted: `projectSchema`, `publicViewerEntryCamera`,
`PublicProjectViewer`) / `npm run docs:ai:check` all green; no repo source was touched,
only the local tier's data (this file is the only tracked-file change). Built this
branch's own frontend (`VITE_API_BASE_URL=https://local.thedi.studio/serverXR`) to check
it against the real local API cross-origin — blocked by the server's own CORS policy
(expected, and correctly so: the ask was never to loosen it). Verified same-origin
instead, which is also the honest test of what the owner will actually open: headless
Playwright, 1440×900 @ DPR 2, `https://local.thedi.studio/wcc/p/main`,
`/wcc/p/emily-v1-framed-entry`, `/wcc/p/emily-v2-arc-of-panels`, no auth token, no
cookie. Zero console errors on all three. Screenshots opened and read, not just
captured — v1 visibly trades `main`'s wide/high/distant default for a low, close shot
with two named zones ahead; v2's side panels visibly foreshorten toward the centre,
confirming the inward angle actually renders, not just computes.

Neither draft is a finished room to put in front of a visitor as-is: v1 still opens onto
the same 20-entity hub-and-zones room with only the camera changed (that was the whole
ask for that version); v2 is three small, dim, unlit panels in a void with no way to
click through to the read-more panel her original had (that interaction had nowhere to
land in the schema, so it was left out rather than faked).
