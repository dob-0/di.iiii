## 2026-09-15 — suite page gaps: assets, uppercase labels, og-image, literal echoes

- Added `wordmark-on-white.png` and `wordmark-transparent.png`, both derived from the
  repo's own correct `wordmark-on-black.png` (4 i's, dot-only cyan) by an exact
  premultiplied-alpha recovery against its pure-black background, then a recolour for
  the on-white variant — not hand-traced, not invented. `di-brand/logo/wordmark-on-*`
  turned out to carry the *retired* 3-`i` typo with a cyan letter (the one NAMING.md
  already flags as fixed) so those were not used as a source.
  - **No vector wordmark source exists anywhere** (di-brand or this repo) — `mark.svg`
    is the square mark only, not the wordmark lockup. Did not fabricate one.
  - **No di.i (studio) wordmark file exists anywhere** — di-brand's own manifest
    (`README.md`) never lists one. Reported, not designed.
- `.eyebrow` and the studio section's `.role` labels were forcing "di.iiii — suite"
  and "di.i" to uppercase via `text-transform`, despite correct lowercase markup —
  the naming rule is lowercase always. Removed the transform from `.eyebrow`; added a
  `.role.brand{text-transform:none}` modifier for the three studio-credit `di.i` labels
  and left the transform on for the generic English section labels.
- Regenerated `og-image.png` via a headless Playwright render (self-hosted Inter/
  JetBrains Mono, same house look) — tagline was ~24px pale grey, illegible once a
  link preview shrinks the image to ~600px. New tagline is 34px at higher contrast;
  confirmed legible after downscaling to 600×315.
- Added `di-iiii-suite.zip` (all served suite files) and one "Download all files"
  link in the files section.
- Literal-echo copy fixed in `public/suite/index.html` (subline, meta description,
  og:description, footer) and mirrored in `~/work/di-spaces spaces/main/projects/suite.json`
  (same three strings) — full old→new list in the PR description.
- `di-studio.xyz` → `diiii.xyz` in the suite page (platform card, credit line, footer
  link, stamp, og:image host) — 5 occurrences, per the 2026-09-15 owner rule to hand
  out diiii.xyz in new copy.
- `src/wiki/wikiContent.js`: "Motion you asked for" → "Authored motion" (~line 556).
- `src/project/graph/examples/sceneExample.js` and its test: removed the owner's
  quoted chat lines from the header/test comment, replaced with a plain description
  of what the example demonstrates.
- `src/landing/crackTransition.js` (the third file named in the request) no longer
  exists — removed upstream in `1bd1d548` ("the crack and variants b/c are gone").
  Nothing to fix there.
- `di-spaces` is a separate repo; its `suite.json` fix is committed locally there
  (`dc1bf31`) and pushed live to the second tier via
  `node scripts/push-project.mjs main suite --env staging` (uses `LIVE_API_TOKEN`,
  never `PROD_API_TOKEN`). The `git push origin master` for that commit was blocked
  by the sandbox's own permission classifier (flagged "Production Deploy") — the repo
  owner needs to push that one commit by hand or grant the permission.
