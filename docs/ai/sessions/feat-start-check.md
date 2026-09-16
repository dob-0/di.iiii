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

## 2026-09-16 (later still) — the cache was the bug: real false LATEST, found live on br-id-ge

- The coordinator ran the previous version against the real box and caught a
  **false LATEST**: br-id-ge's `newww`/`landing`/`br-id-ge-field` had all
  changed on the dev tier that afternoon, local's copy was behind, and the
  tool said LATEST anyway. Cause: the version-cache seeded itself FROM
  whatever state existed on its first run — if drift already existed before
  that first run, nothing ever looked like it had "moved" relative to a
  baseline that was itself already wrong. Also flagged: that cache
  (`start-check-cache.json`) had been written into the owner's shared data
  tier (`~/.local/share/di.iiii/data/`), which a read-only check must never
  touch — deleted.
- Fixed: dropped the cache entirely. Every run now compares the two tiers
  DIRECTLY: cheap `documentVersion`+`updatedAt` (already fetched, no new
  request) settle a project as "same" only on an EXACT match; when they
  differ, `tier-sync-baseline.json` — a real, content-verified reference
  point written by actual tier-sync runs, never guessed — says who moved,
  confirmed with one live document-fetch pair (budgeted,
  `CONFIRM_FETCH_BUDGET = 30`, to keep the whole run bounded); with no
  baseline, the side with the later `updatedAt` is reported as ahead
  (unconfirmed, labeled as such), and only "dev is later" flips the headline
  — a genuine tie with no baseline is surfaced as "differs (undetermined)",
  never silently called "same".
- Also fixed: each space now lands in exactly ONE summary bucket
  (`SUMMARY_PRIORITY`, highest-severity kind wins) — `main`/`what-we-have`
  previously appeared under BOTH "local-only" and "dev-only" because
  separate PROJECT rows inside the same shared space picked separate space
  IDs for each bucket independently. A project missing entirely on one side,
  inside a space BOTH tiers hold, is now a definitive `dev-ahead`/
  `local-ahead` (not a neutral "only exists" note); a SPACE missing entirely
  from one tier is its own one-line, non-drift bucket.
- Verified for real, read-only, against the owner's actual env
  (`local.thedi.studio` + `staging.di-studio.xyz`): `--space br-id-ge
  --strict` → **NOT LATEST**, exit 1, `br-id-ge-field`/`landing`/`newww`
  confirmed via baseline as "changed on both" — cross-checked against
  `node scripts/tier-sync.mjs --from local --to staging --space br-id-ge
  --audit` (the independently-trusted comparison), which reports the exact
  same 4 projects as "same slug, DIFFERENT work". An unfiltered full-box run
  (~31 spaces) puts `br-id-ge` under "newer on dev" in the summary line, per
  the coordinator's literal ask, in 4.4s wall clock. Known remaining
  imprecision: which LABEL a borderline project gets (confirmed vs.
  timestamp-heuristic) can vary with the shared `CONFIRM_FETCH_BUDGET`
  running out earlier in a big unfiltered run than in a `--space`-filtered
  one — never changes the LATEST/NOT LATEST verdict itself, only which of
  "changed on both" vs. "newer on dev (by timestamp)" a given project shows.
