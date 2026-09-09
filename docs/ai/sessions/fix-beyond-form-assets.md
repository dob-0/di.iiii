## 2026-09-10 — Beyond Form's 13 missing GLBs: found on prod, restored, and the blind spot closed

- `beyond-form/open-call` referenced 13 GLBs. The dev box and staging had none of
  them — five console 404s per view, the works never drawn, the space card unable
  to paint. **Production had all 13, whole.** They were pulled from prod and pushed
  to local and staging; asset ids are the sha256 of the stored bytes, so every
  re-upload landed on the id the document already names and nothing had to be
  rewritten. 39/39 asset GETs now answer 200 across the three tiers.
- The cause was not lost bytes but an invisible dependency. `space-sync.mjs`
  uploads a code page's files and rewrites their names into
  `/serverXR/api/projects/<id>/assets/<sha256>` URLs *inside the built markup*,
  and never writes a row into `document.assets`. Every transfer script read that
  manifest alone — `project-pull.mjs` had `const assetList = document.assets` —
  so this project reported `0 assets`, copied nothing, and exited 0. Same shape as
  the asset-remap bug of the same file: a transfer trusting a document to declare
  its own assets.
- `scripts/document-asset-refs.mjs` now reads the ids off the document itself
  (manifest rows, then every 64-hex asset URL in any string). `project-pull.mjs`
  uses it, so `local-mirror.mjs` does too.
- `npm run assets:audit` (`scripts/asset-refs-audit.mjs`) walks a tier and names
  every project referencing assets that tier does not hold, exiting 1. Its first
  real run found five more, all on the dev box and all pre-existing:
  `open/front-room`, `open/front-room-light`, `open/look-signal`, `open/look-night`,
  `open/look-paper` — 76–78 assets each, every one missing, uuid-style ids from
  before content addressing. **Not fixed here** — a separate restore, and nobody
  had ever been told they were broken.
- Looked at, not assumed: headless Chromium on `https://local.thedi.studio/beyond-form`
  and on staging, walking into the srcdoc frame — all 13 GLB requests 200, zero
  console errors, the Gyumri houses and the artists' models painting, and the
  beyond-form card on `/spaces` showing its page again.
