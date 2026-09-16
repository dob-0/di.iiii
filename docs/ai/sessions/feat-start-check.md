## 2026-09-16 — the start check: one LATEST/NOT LATEST answer for code and spaces

- Added `scripts/start-check.mjs` (`npm run start-check`, `--strict` exits 1). It
  fetches `origin` (and `upstream` when this is a fork) with a hard timeout, then
  reuses `scripts/repo-state.mjs`'s `getState()` for the code half (branch vs
  `origin/dev`, fork `dev` vs `upstream/dev`, uncommitted work) and
  `scripts/tier-sync.mjs`'s `listSpaces`/`readSignatures` (built on
  `documentSignature`) for the space half — compares this box's held spaces (or
  `--space <id>`) against the dev tier, using `tier-sync-baseline.json` to tell
  "dev moved" from "I moved" from "no baseline, can't tell". Every network step
  degrades to "not checked" inside its own budget rather than ever reporting a
  false LATEST.
- To make that reuse possible: `repo-state.mjs` now exports `getState` and guards
  `main()` behind the standard `invokedDirectly` check (previously ran
  unconditionally at import time). `tier-sync.mjs` hoisted `call`/`listSpaces`/
  `listProjects`/`readInventory`/`readSignatures` from closures inside `main()` to
  module-scope exports, and re-exports `readBaseline` (read-only) — no behavior
  change, same functions, now importable.
- `.claude/settings.json`'s `SessionStart` hook now runs `start-check.mjs` (wrapped
  in `timeout 25`, falling back to the old `repo-state.mjs --brief` if that's
  somehow exceeded) instead of the fetch-less `repo-state.mjs`. `pre-push-gate.sh`
  runs `start-check --code-only --json` and prints a warning (never blocks) when
  the branch is behind `origin/dev`.
- Every write-path script now refuses a stale destination instead of silently
  overwriting it:
  - `space-push.mjs` reads the destination's current scene version
    (`?verbatim=1`) before writing and sends `If-Match` on the `PUT` — the server
    already understood this precondition (`spaceRoutes.js`), the script just
    never used it. `--force` overrides.
  - `space-sync.mjs` re-reads the project document's version immediately before
    the `PUT` (that route has no server-side precondition to lean on) and
    refuses if it moved since the read this run started from. `--force` overrides.
  - `tier-sync.mjs`'s plain (non-`--changed`) `--force` path — the one write path
    that ignored `tier-sync-baseline.json` entirely — now checks it too before
    overwriting a project the destination already holds; a mismatch needs the
    explicit `--force-stale` on top of `--force`. Pure decision logic pulled out
    as `shouldRefuseOverwrite` for testability.
  - `space-bundle.mjs import --force` refuses when the target space's own
    `updated_at` is newer than the bundle's `exportedAt` — someone touched it
    since this bundle was made. `--force-stale` overrides. This check is opt-in
    (`checkStale: true`, set only by this file's own CLI dispatch) because
    `install-bundle.mjs` calls `importSpace()` internally as one step of
    restoring an entire estate from one point-in-time snapshot, where "target
    changed moments before its own import" is the expected shape of that
    restore, not a sign of a concurrent edit about to be lost — confirmed by two
    `installBundleContracts.test.js` cases that regressed and were the reason
    this got scoped down to opt-in rather than always-on.
- New `CONTRIBUTING.md`: "Two lines: code and spaces" — what lives in git vs each
  tier's database (local / **dev.diiii.xyz** / **diiii.xyz**), the start check, and
  one short section per door (Studio by hand, a script, an LLM/agent — any tool,
  not just Claude — Telegram, a fork on Windows). States plainly that
  `staging.di-studio.xyz` is the old name for the dev tier and still answers, and
  that the rest of the safety net (author-on-every-change, restore points, undo)
  is coming in later PRs with no promises yet on shape. `AGENTS.md`'s "Start Here"
  now points to it as step 0; `ONBOARDING.md` §7 links it. Golden rule added to
  `docs/ai/golden_rules.md`. Fixed `.claude/commands/branch.md`'s `feature/<slug>`
  to this repo's real `feat/`/`fix/`/`chore/` prefixes.
- Tests: `scripts/start-check.test.js` (mocks `repo-state.mjs`/`tier-sync.mjs`/
  `node:child_process` — up-to-date, behind, fork-behind, dev-ahead-on-a-space,
  tier-unreachable, local-tier-unreachable, formatting); new stale-destination
  cases added to `scripts/space-push.test.js`, `scripts/space-sync.test.js`,
  `scripts/tier-sync.test.js`; new `scripts/space-bundle.test.js` (didn't exist
  before this branch). All spawn/mock-based — nothing here writes to a real
  dev/prod tier.
- Constraint honored: no writes to any remote tier from this branch's own testing;
  every write-path test uses either a local `node:http` fake tier or a temp SQLite
  data root created for the test.

Not done here (out of scope for this PR, section B of the plan): actor stamping on
`space_ops`/`project_ops`, restore points beyond Open Space, the snapshots/history
API, the inner-bot notice+Undo, Studio's History panel. `CONTRIBUTING.md` names
these as "coming in later PRs" without promising their shape.
