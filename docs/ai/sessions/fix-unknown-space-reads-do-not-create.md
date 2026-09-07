## 2026-09-06 — an unknown address answers "nothing lives here" on a local install too, and reading it writes nothing

Two of the festival-machine inventory's minor gaps (`docs/testing/FESTIVAL_MACHINE_2026-09-06.md`), the "not-found" lane.

- **Server.** `GET /api/spaces/:id/scene` called `ensureSpaceScene` before reading, so a
  read for an id nobody created wrote a directory and a blank `scene.json` into the real
  data tier. With auth on, `requireReadRole`'s own 404 hid it; with auth off (a `di up`
  install) the handler ran — seven stub folders during the inventory. The read now checks
  `spaceExists` and answers `404 Space not found.` without touching the disk; the
  `ensureSpaceScene` call is gone from the read path. Nothing that legitimately comes into
  being on first access changed: a session's own sandbox and the boot-ensured open space are
  provisioned by the `/api/spaces/:spaceId` middleware and boot code *before* this handler,
  and a row that has no `scene.json` yet (`main` after boot) reads as the blank scene, which
  is what the first write started from anyway. Writes (`POST /ops`, `POST /api/spaces`,
  inscriptions) still ensure.
- **Client.** `AuthGate` skipped every check when `requireAuth` was off, so `/make` or a
  typo on a local install opened a silent empty room with Enter VR/AR on it, where the live
  site says "Nothing lives at …". The gate now runs the same existence lookup the
  out-of-scope path uses (only once the session has answered — while it loads, `requireAuth`
  reads false on every tier, and a hosted page must not pay for a lookup it never uses) and
  shows the same card, with the same doors; the sign-in buttons and account chip stay off,
  there is nothing to sign in to. The card is one component now (`ClosedDoorCard`) rendered
  by both branches, so the wording cannot drift.
- `useSpacePublicFlag` reported the OLD id's answer for the render between the id changing
  and its effect running — `loading:false, exists:true` for a space nobody had looked up
  yet. It now reports loading synchronously for a new id. (That frame also flashed the
  "Access restricted" card on the hosted tier before the lookup began.)

Verified: `npx vitest run serverXR/src/httpContracts.test.js` (the new contract boots a
server with auth off and on, GETs an unknown id's scene, expects 404, asserts
`data/spaces` is byte-for-byte the same directory listing, and that `main` still reads 200
with no `scene.json` written), `spaceRoutes.sceneAssetCache/driveImport/spaceIdParam`
tests, `src/components/AuthGate.test.jsx` (five local-install cases: a real space renders,
no-space renders at once, a typo and a bare `make` get the card with the Open Space door
and no sign-in controls, the room is held back until the lookup answers). Seen: a
`DI_PROFILE=local` build served by my own serverXR on a scratch data root with every
non-local request aborted — `/make` and `/does-not-exist` show the card at 1280×800 and
390×844, `/open` still opens the room, `data/spaces` stayed `main` + `open` after three
unknown-id scene reads.

Not done: `GET /api/spaces/:id/ops` for an unknown id still answers 200 with an empty
history (no disk write, so left alone). The card's only door on a local install is
Open Space — the session names no sandbox there; a door to `/spaces` would be the useful
addition, not made here.
