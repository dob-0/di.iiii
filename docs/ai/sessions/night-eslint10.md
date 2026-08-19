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
