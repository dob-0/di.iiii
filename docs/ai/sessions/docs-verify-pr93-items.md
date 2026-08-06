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
- Opened as PR #98 against `dev`. First commit (`84409f2a`) got a green CI run after
  one rerun (transient runner-queue failure, unrelated to this change). The follow-up
  sync commit (`f883c8f9`) never got a CI run dispatched at all — confirmed via the
  GitHub API (`check-runs` and `actions/runs?head_sha=...` both empty, not a display
  lag) while `dev`'s own staging deploy was queuing/cancelling repeatedly from heavy
  concurrent push traffic on other branches at the same time. No `workflow_dispatch`
  trigger exists on `ci.yml` to force it (`pull_request` only, deliberately no `push`
  trigger — see the workflow's own comment). Left waiting rather than forcing an empty
  commit or a close/reopen, since the cause reads as GitHub-side congestion, not this
  branch's problem. **Not yet merged** — merge, and any retrigger, is the user's call.
