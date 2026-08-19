## 2026-08-19 — eslint 9 → 10.8.1, taken on a narrower route than the park allowed

- The recorded verdict parked this until `eslint-plugin-react` and
  `eslint-plugin-jsx-a11y` both declared an eslint 10 peer. Checked against the registry
  today: neither has. `eslint-plugin-react@7.37.5` (latest) still caps at `^9.7`,
  `eslint-plugin-jsx-a11y@6.10.2` (latest) at `^9`. The bump was taken anyway, and
  `docs/ai/dependency-decisions.md` now says so in those words rather than pretending
  the condition fired.
- The route is a scoped `overrides` entry forcing `eslint: "$eslint"` on exactly those
  two packages. That is deliberately not `--legacy-peer-deps`, which the old verdict
  banned because it disables peer checking for the whole install. The `brace-expansion`
  override the same verdict banned is still absent — that ban stands.
- What it actually buys: 6 of the 7 `brace-expansion` highs are gone. eslint's own chain
  (`eslint`, `@eslint/eslintrc`, `@eslint/config-array`, `minimatch@10`) now resolves
  `brace-expansion@5.0.9`, which is patched. One high survives, via
  `eslint-plugin-jsx-a11y`/`eslint-plugin-react` → `minimatch@3.1.5` →
  `brace-expansion@1.1.16`, and it stays until those plugins drop minimatch 3. Still
  dev-only, still never bundled, still outside the CI gate.
- One real incompatibility surfaced and is fixed: `eslint-plugin-react`'s
  `version: 'detect'` calls `context.getFilename()`, removed in ESLint 10, so lint died
  on the first file. `eslint.config.js` pins `react: { version: '18.3' }` instead. Keep
  it in step with `package.json`.
- The residual risk, stated plainly: the plugins run against a major they do not claim
  to support. Lint across `src serverXR scripts shared` is green — 0 errors, 31
  pre-existing warnings, the same count as on eslint 9 — so every rule this repo
  exercises works. A rule not currently triggered could still break later. That failure
  mode is a loud lint error in CI, never a silent production bug; eslint does not ship.
- No visual verification was done and none is owed: this touches the lint toolchain
  only, and `npm run build` output is byte-identical in shape to `dev`'s.
- Supersedes Dependabot PR #148, which bumps eslint alone and cannot resolve the peers.

## 2026-08-19 — the bump broke CI, and the reason it passed locally is its own bug

- CI's first run failed at Lint: `ERR_MODULE_NOT_FOUND: Cannot find package
  '@eslint/js' imported from eslint.config.js`. Line 1 of that config has always been
  `import js from '@eslint/js'`, and the package has never been declared in
  `package.json` — it rode along as a transitive dependency of eslint 9. **eslint 10
  dropped it**, so a clean `npm ci` no longer has it. Fixed by declaring it explicitly
  at `^10.0.1`.
- The reason local lint stayed green is the more useful finding: these worktrees live
  under `.claude/worktrees/`, which is *inside* the main checkout, so Node's resolver
  walks up past the worktree's own `node_modules` and finds the parent tree's — which
  still holds eslint 9 and its `@eslint/js`. **A missing dependency in a nested worktree
  is invisible to every local command.** Recorded in `docs/ai/known-fixes.md`.
- Guard: `src/eslintConfigDeps.test.js` parses every bare import in `eslint.config.js`
  and asserts each is declared. Watched failing — `expected [ '@eslint/js' ] to deeply
  equal []` — with the dependency removed, then passing with it restored.
- The lockfile needed care: local npm is 10.9.8 and strips the `libc` fields that npm 11
  writes, so a plain `npm install` would have rewritten 30 unrelated lines. The install
  was redone through `npx npm@11` — the diff is 22 additions and nothing else.

## 2026-08-19 — eslint 10's recommended set found 21 real things

- With `@eslint/js` finally resolving to v10 rather than the parent worktree's v9, two
  rules join `eslint:recommended` and both earned their keep. All 21 are fixed rather
  than switched off.
- **`no-useless-assignment` (16).** Every one is the same shape: `let entries = []`
  immediately before a `try` whose `catch` either returns or reassigns, so nothing ever
  reads the initializer. Dropped the initializer, kept the binding — no behaviour change.
  The exception is `serverXR/src/index.js`, which assigned `installationId` from the
  fallback installation lookup and then never read it again; that assignment is gone.
- **`preserve-caught-error` (5).** Rethrows that interpolated the caught error's *message*
  into a new `Error` and dropped the error itself, losing the stack. Each now passes
  `{ cause }`: `scripts/project-pull.mjs`, `scripts/space-sync.mjs`,
  `src/hooks/useAssetPipeline.js` (×2), `src/hooks/useSpacesController.js`.
- **Owed, and not done here:** `scripts/space-sync.mjs` is the *upstream* of the sync
  engine vendored into br_id_ge, beyond_form and platform_recordar as
  `scripts/sync-space.mjs`. This one-line change drifts all three. `npm run
  space:sync:vendor` reports it; `-- --write` re-vendors and commits each repo. That is
  a cross-repo action and was left for the owner. Nothing in di.iiii's own CI checks it,
  so it will not go red here — it will simply be stale until someone runs it.
- Re-validated after the fixes: lint 0 errors / 31 warnings, build clean, **279 files /
  2316 tests** (the extra one is the new guard), 96 server contracts.
- Looked at, because these touch runtime paths: full `verify:surfaces` on this branch's
  own dev stack, desktop + 5 devices — **24 of 30 combos clean**, 0 horizontal overflow.
  `/studio` renders identically to the router7 branch's capture. The 6 failures are all
  `/main`, all the same local-database 401/403, on every device.
