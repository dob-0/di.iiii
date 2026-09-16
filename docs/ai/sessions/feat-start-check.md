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

## 2026-09-16 (later) — rebased onto the "staging" retirement; the space check rebuilt after real-box testing

- Rebased onto `origin/dev` after `chore: retire "staging" — the tiers are local ·
  dev · prod` landed (PR #471) — `TIERS.staging.base` is now `dev.diiii.xyz`,
  `resolveTier`/`tierLabel` exist, `isProductionTarget` also covers `diiii.xyz`.
  One textual conflict (an import line in `tier-sync.test.js`); everything else
  auto-merged clean and was re-verified by hand against the new file shapes.
- Ran the space check against the owner's real env for the first time
  (`local.thedi.studio` + `staging.di-studio.xyz`, ~31 held spaces, ~100
  projects) and it did not hold up:
  1. `localBase()` in `tier-sync.mjs` appended `/serverXR` unconditionally —
     `LOCAL_API_URL=http://localhost:4000/serverXR` produced
     `.../serverXR/serverXR/api/spaces` → 404. Fixed to be idempotent about the
     suffix. `checkSpaces` also now retries a configured-but-unreachable local
     tier against plain `http://localhost:4000/serverXR` once (network
     failures only, never on an auth error) and names every base it tried in
     the "not checked" reason.
  2. The original design fetched and hashed every project's full document on
     both tiers — against ~100 real projects it either blew its own 10s
     budget or, once, printed ~60 "not checked (time budget exceeded)" lines.
     Replaced with a cheap comparison: one `GET /api/spaces/:id/projects` per
     tier per space (documentVersion + updatedAt for every project in that
     space, no per-project request), compared against what THIS box last saw
     for that project (`serverXR/data/start-check-cache.json`, resolved the
     same way `tier-sync-baseline.json` is — DATA_ROOT-relative — but a
     separate file; tier-sync never reads or writes it). A version bumps on
     every write (`projectRoutes.js`), so "unchanged since I last looked" is
     as reliable as a content hash for detecting motion, without reading
     content. Spaces run `SPACE_CONCURRENCY` (6) at a time.
  3. Output redesigned to one summary line grouped by SPACE, not project
     ("19 same · 2 newer on dev: wcc, br-id-ge"), then up to 5 detail lines
     with the exact pull command, then "+N more — npm run start-check --
     --spaces-detail" for the rest. `not-checked` rows collapse into one line
     grouped by reason with a count, never one line each.
- Verified for real, read-only, against the owner's actual local install and
  the actual dev tier (`local.thedi.studio` + `staging.di-studio.xyz`, sourced
  from `di.iiii/serverXR/.env.local`): first run (cold cache) 31 spaces in a
  few seconds, all reported "new (uncompared)" since nothing was cached yet;
  second run 2.35s wall clock, correct "same"/"local-only"/"dev-only" split,
  no drift (nothing changed between the two runs, as expected). The
  `SessionStart` hook command itself (CURRENT.md print + `timeout 25 node
  start-check.mjs`) ran in 2.21s total — well inside its 25s/30s budgets.
  `serverXR/data/start-check-cache.json` now exists for real on this box,
  alongside the existing `tier-sync-baseline.json`.
- `classifyProjectDrift`/shape-baseline comparison removed in favor of
  `classifyVersionDrift`; tests rewritten to match
  (`scripts/start-check.test.js`, `scripts/tier-sync.test.js` gained
  `localBase` coverage). `tier-sync.mjs` gained `listProjectMetas` (the cheap
  list read, exported for reuse — the same reuse-not-copy rule the rest of
  this file follows).
