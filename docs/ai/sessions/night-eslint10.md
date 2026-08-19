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
