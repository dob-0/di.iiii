## 2026-09-10 — a bare reserved word is not a space id, and now says what it is

Two defects, one cause. `/make` fired `GET /serverXR/api/spaces/make` → 404 on every
tier; `/light` on di-studio.xyz and staging returned 200 and rendered the same
ordinary card. Both words are in `RESERVED_APP_SEGMENTS` *so that no space can ever
be named them* — and `getAppLocationState` guarded that list at `segments[1]` only,
never at `segments[0]`. A bare `/{reserved}` therefore fell through as a space id to
`SpaceSurfaceRoute`, whose lookup can only 404, whose card then read "there is no
space with that address. Check the spelling" — wrong advice for a word spelled
correctly, and the whole of what a visitor asking a hosted tier for the lighting desk
ever saw.

- `getBareReservedSegment()` names a bare unclaimed reserved word. RootApp calls it
  LAST, after every lane router: `/raw`, `/studio` and `/spaces` are bare reserved
  words too and return above it untouched, and `/beta` still falls through as an
  unclaimed space (its existing test still passes unchanged).
- `ReservedAddressCard` answers the three that reach it — `make`, `light`, `projects`
  — each naming what the word actually is, linking its wiki article, and making no
  space lookup at all. Same card shell as `AuthGate`'s `ClosedDoorCard`, so the two
  cannot drift.
- `/light` on a local install still never reaches the SPA (serverXR answers it before
  index.html; verified `https://local.thedi.studio/light` → 302 → 200 desk HTML). A
  client-side navigation there hands the address back to the server rather than
  explaining the desk away.

**nginx is NOT involved on the `/light` path** and needs no deploy-side change:
`location /` serves `index.html` from the static volume and never proxies, so
serverXR's `requireLocalRuntime` 404 (`/serverXR/light` → 404 on prod, confirmed) is
never on the wire a browser sees. The SPA is the only place that can answer a hosted
`/light`, and a bare 404 page would say less than this card does.

Guards, watched failing first: two cases in `RootApp.test.jsx` (both timed out at 5s
against the old dispatch) plus `getBareReservedSegment` unit cases in
`spaceRouting.test.js`. `AuthGate.test.jsx` lost its `/make` case — that address no
longer reaches the gate; its mistyped-id case (`ghost`) is the one that still covers
the card.

Looked at both cards at 1440x900 and 390x844 on a production build served through a
plain SPA catch-all.
