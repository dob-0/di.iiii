## 2026-10-07 — root lockfile: eight advisories in dev tools cleared (lockfile only)

- `npm audit` at the repo root reported 8 advisories (6 high, 2 moderate) against dev-only tools — brace-expansion, browserslist, js-yaml, nanoid, postcss, source-map-js, undici, baseline-browser-mapping. GitHub Dependabot listed the same set (12 alerts). Only `serverXR` is audited in CI (`Audit dependencies (serverXR)`), so nothing had failed and nobody had been told.
- Fixed with `npm audit fix --package-lock-only`: 12 packages moved inside their allowed ranges, all marked `dev`, `package.json` untouched. After a clean `npm ci`: `npm audit` = 0 vulnerabilities, `npm run build` passes, `src/styles` + `src/works` tests 397/397.
- Not done, owner's call: gating the root audit in CI. A root gate would turn every new advisory into a red deploy, which is what the serverXR gate did to dev on 2026-10-06 (#790).
