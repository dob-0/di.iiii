## 2026-09-14 — the not-found card names the right thing and stops asking you to sign in

- `/spaces/nope` on a hosted tier used to answer "Nothing lives at "spaces"" — the
  first path segment, which is a real reserved address (`RESERVED_APP_SEGMENTS`),
  not the part the visitor actually got wrong — inside the same card as a full
  sign-in form (`PasswordSignIn` + GitHub/Google). A guest session lands on this
  path (`AuthGate.jsx`'s authenticated-and-out-of-scope branch) any time the first
  segment of an unknown address is itself a reserved word with no multi-segment
  route of its own: `/spaces` and `/projects` are the two live examples (`spaces`
  claims only the bare hub, `projects` only has a `ReservedAddressCard` for the
  bare form), so routing falls through the generic `/{space}/{slug}` parser and
  hands the reserved word to the gate as if it were the space id.
- Third time this exact message has named the wrong thing (`/login` and `/make`
  were the first two — see the comment in `RootApp.test.jsx`'s "RootApp bare
  reserved addresses" describe). This time the fix is in `AuthGate.jsx`, not the
  router: `ClosedDoorCard` now reads the real address bar (`missingAddressFromUrl`)
  only when `requiredSpaceId` is itself a reserved segment, and shows the segment
  that actually followed it — "nope" for `/spaces/nope` — instead of the reserved
  word. An ordinary mistyped space id (`/ghost`) is untouched: it was already
  named correctly.
- The sign-in form (`ProviderSignInButtons`, which wraps `PasswordSignIn` and the
  OAuth buttons) no longer renders on the not-found card at all — no account can
  make a space that never existed exist, so offering to sign in there was the
  wrong door. It still shows on the real "Access restricted" card, where signing
  in with a different account is the actual fix. The floating account chip
  (`AccountButton`) is unchanged either way — it is not a sign-in prompt, and stays
  reachable on both cards, same as before.
- Doors onward (Open Space / your private sandbox) are unchanged on both cards —
  they were already the "one or two clear ways on" this screen needed; nothing
  about them was the reported gap.
- Tests: `AuthGate.test.jsx` gained a new "AuthGate not-found card" describe block
  (reserved-word naming, ordinary mistyped-id naming, sign-in form absent on
  not-found, sign-in form still present on real out-of-scope). `RootApp.test.jsx`
  gained one routing-level regression test pinning that `/spaces/nope` reaches the
  generic space gate (not the spaces hub) with `requiredSpaceId="spaces"` — the
  name correction itself is proven in `AuthGate.test.jsx`, since `RootApp.test.jsx`
  mocks `AuthGate.jsx` entirely.
- Left open: the same fallthrough exists for any reserved word with no
  multi-segment route of its own that also has a tail (`/projects/x`, `/login/x`),
  not only `/spaces/x` — not fixed here, out of scope for this one reported gap.
  Also open: the space lookup for the reserved word (`GET /api/spaces/spaces`) still
  fires and 404s before the not-found card can render — wasteful but not
  incorrect, matching the existing mistyped-id path; `/make` and `/light` avoid
  the round trip entirely via `ReservedAddressCard`, and the same could be done
  for `/spaces` and `/projects` tails in a follow-up.
