## 2026-09-16 — "staging" retired: the tiers are local · dev · prod

- Owner, 2026-09-16: "we have not staging anymore". The second tier is **dev**, addressed
  `dev.diiii.xyz`; `staging.di-studio.xyz` is the same server under its old name and still
  answers only for links already handed out. Lexicon amended in `docs/ai/vocabulary.md`
  (the tier table and the list of identifiers that deliberately keep `staging`).
- Words and links changed across docs, comments, help text and copy; dated history left as said.
  `src/copyVocabulary.test.js` now bans `staging` in user-visible strings.
- The tier mark reads **DEV** at both names (`MODE_STAGING` → `MODE_DEV`).
- Tier arguments accept `dev` as an alias and keep `staging` working: `deploy.mjs`,
  `tier-sync`, `space-sync --tier`, `local-mirror`, `data-cleanup`, `asset-refs-audit`,
  `page-vendor-cdn`, `normalise-page-asset-urls`, the cPanel scripts, and the SDK
  (`DI_TOKEN_DEV`, falling back to `DI_TOKEN_STAGING`). Space manifests keep the key
  `tiers.staging`, now pointing at `https://dev.diiii.xyz/serverXR`.
- Fixed on the way: nginx sent no `noindex` at `dev.diiii.xyz` (the map matched only `^staging\.`);
  `isProductionTarget` in tier-sync/space-push did not know `diiii.xyz` was production.
- Kept on purpose (machine identifiers): `STAGING_*` / `VPS_STAGING_*` env vars,
  `docker-compose.staging.yml`, `deploy-vps-staging.yml` and its name, container
  `dii-staging-server-1`, `/opt/di.iiii-staging`, GitHub environment `staging`, image tags,
  `DEPLOY_ENV=staging`, `cpanel-staging`, npm script names, manifest key `tiers.staging`,
  the Android package id `xyz.distudio.chat.staging`.
- For the next land, CURRENT.md's wording should follow: `tiers: local · dev → dev.diiii.xyz
  (rehearsal) · main → diiii.xyz (live)`; "Dev-tier deploys fold their own notes";
  `git push origin dev # → dev tier`; the owner item reads "dev-tier Google OAuth secret".
- Still owed: the `space-sync.mjs` alias needs `node scripts/space-sync-vendor.mjs --write` into
  the vendored copies; `~/di-spaces` tools refuse a `staging` target whose host isn't `staging.`;
  the URL spec draft still proposes `studio.staging.di-studio.xyz` (owner's call); the chat APK
  twin is locked to the old host until rebuilt; `sync-space-to-staging.sh` loops `"$@"` so
  `--force` is read as a space id (pre-existing).
