## 2026-09-10 — a local install carries the works, and slim becomes a flag

The owner opened `https://local.thedi.studio/wcc` on his own machine and got "not in
this copy — this piece lives on di-studio.xyz". `/wcc/logos/wcc.svg` 404'd there and
200'd on both hosted tiers. His own exhibition was the one thing on his own disk he
could not open, and the machine it was on is the one that goes to venues with no
network. Asked to choose between carrying the works offline and staying small, he
said: **we need full.**

So `DI_PROFILE=local` now builds the program AND the works. The strip survives,
unchanged and named: `DI_LOCAL_SLIM=1`.

- `src/works/buildProfile.js` — new, and the whole seam. Plain data, no app imports,
  same rule as `works.js` next door, because `vite.config.js` loads it at build time.
  `resolveBuildProfile(process.env)` answers one question — which of the three shapes
  is this — and returns what each half of the build needs: what to stub, what public
  directories to copy, which works are in the artifact. It reads the registry; nothing
  types a work's name.
- `vite.config.js` — `localProfilePlugin()` (the stubbing one) is installed only under
  `DI_LOCAL_SLIM=1`; `localPublicDirPlugin()` stays on for any local build and its
  include-list now carries each work's `publicDirs` from the registry. New define
  `__DI_WORKS__` — which works are in THIS artifact.
- `dist/build-profile.json`, new, written by every build. The packer used to tell the
  shapes apart by sniffing for `dist/wcc` and `.mp4`s, which only worked while a local
  build was the one without them. It reads the marker now, refuses a mismatch, and
  records `works` in `release.json` alongside `profile`.
- `scripts/pack-runtime.mjs` — `--slim` added, `--full` unchanged, and the guard above.
  `npm run di:pack` (what `release.yml` runs) is now the full artifact.
- `src/landing/LandingPage.jsx` — the featured-exhibition row was hidden whole behind
  `!isLocalInstall`, so a local install had no link to WCC anywhere on its front door.
  Its own comment gave TWO reasons and only one of them expired: the works were absent
  (no longer true), and `br_id_ge`/`beyond-form` are database rows a fresh install does
  not have (still true). Split per chip: a work shows if `__DI_WORKS__` says it is in
  this build, a space shows only on the hosted site. Exported as `featuredSpacesFor`.

Measured on this machine, not estimated:

| build | dist | tarball |
| --- | --- | --- |
| hosted (`npm run build`) | 133,113,755 B (128 MB) | — |
| local, full (`DI_PROFILE=local`) | 132,968,887 B (128 MB) | 113.6 MB |
| local, slim (`+ DI_LOCAL_SLIM=1`) | 14,608,565 B (15 MB) | 4.7 MB |

The increase is two directories and nothing else: `dist/wcc` at 25 MB (the microsite's
media, of which `artist-works-land` is 20 MB) and algovrithm's reels and scan inside
`dist/assets`, which take it from 8.1 MB to 97 MB. Full-local is 144,868 B *smaller*
than hosted — that difference is di-studio.xyz's furniture (`get.sh`, `og/`, the cPanel
php shims, `robots.txt`, `sitemap.xml`), which the include-list still leaves out.

Nothing in either work needs the network. `https://` in their source is three comments
and one test constant; `public/wcc` references only github.com and babeljs.io inside
vendored library error strings, and its React/Babel are vendored at
`public/wcc/artist-works-land/vendor/`. The one third-party request WCC ever made —
two `@import` lines to fonts.googleapis.com — was self-hosted away on 2026-07-29
(`src/wccSite/landing/fonts.css` says so). An offline install can open both pieces.

### Guards

- `src/works/localProfile.test.js` — new. Loads `vite.config.js` three times under
  different env and asserts the plugin list, plus `resolveBuildProfile` directly.
  Before the change it said: `expected [ 'di-local-profile', …(13) ] to not include
  'di-local-profile'` and `"undefined" is not valid JSON` for `__DI_WORKS__`.
- `src/landing/featuredSpaces.test.jsx` — new. A local install keeps the works' chips
  and still drops the spaces.
- `scripts/packProfile.test.js` — updated to the new shape. Its size backstop now
  applies to `local-slim` only and reads the marker; a full local build is *meant* to
  be large.

### Left alone deliberately

- `src/studio/components/SpaceHub.jsx`, `src/utils/spaceRouting.js`,
  `src/works/routes.jsx` — another agent is on `fix/space-card-door`. `SpaceHub.test.jsx`
  carries one now-stale comment about the local profile stubbing a work's route; it is
  a comment, in that agent's file, and can be swept later.
- `PROGRESS.md` and the historical paragraphs in `golden_rules.md` — they are a record
  of what happened, not a claim about today. Only the rule itself was amended.
- `.github/workflows/install-matrix.yml` runs a bare `npm run di:pack` on every push
  that touches the packer, so its CI job now builds and archives 113.6 MB instead of
  4.7. It still passes; whether that job should pass `--slim` is a judgement about CI
  time, not about the product, and is the owner's call.
- Nothing installed, nothing pushed. `di update` / `di up` / `di down` untouched — a
  peer agent is installing on the live tier.
