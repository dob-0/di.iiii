## 2026-08-06 — Verified PR #93's 4 unseen fixes in a real browser

- Audio autoplay/loop toggles: imported a fresh WAV into a Studio guest sandbox with
  nothing set — both toggles showed On, matching the fix's claimed default.
- Beta Help copy: checked Start Here/World tabs and their All Controls panels, no
  leftover "node 0" wording anywhere.
- Primitive-shape clamping: typed a negative sphere radius — the Inspector input
  rejected the negative sign outright and settled on a small positive value; the
  sphere stayed valid the whole time, no crash or invisible/inverted geometry. Couldn't
  reach the deeper "malformed authored JSON" path (no raw scene-JSON editor in Studio's
  UI) — that half still relies on the passing unit tests, not a fresh eyeball.
- Inspector wheel-scroll guard (`Vector3Control`): traced its only render path and it's
  dead code — `App.jsx` → `SpaceSurfaceApp`'s `isLocalRootWorkspace` branch is the sole
  route in, but `RootApp.jsx` always resolves the no-`spaceId` case to the marketing
  landing page first, so no live URL renders it. The fix is real and unit-tested; there's
  just no current stage to see it on. Not a gap in this session's testing.
- `docs/ai/known-fixes.md` rows for all four updated with these findings in place of
  the stale "not yet eyeballed" notes.
- Also this session: promoted `dev` to `main` (fast-forward, deployed, verified live),
  and merged the session-hygiene PR (#94) — `npm run state`, the CURRENT.md derived-fact
  ban, and the push-gate wiring this branch's own note-based workflow builds on.
- Opened as PR #98 against `dev`. First CI attempt hit a transient GitHub runner-queue
  failure ("job not acquired by hosted runner"), unrelated to this change — reran and
  it's green (build-and-test + browser-checks both pass). **Not yet merged** — merge is
  a deliberate call left to the user, not something this session does unattended.
