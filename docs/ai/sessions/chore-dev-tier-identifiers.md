## 2026-09-16 — dev tier identifiers renamed; staging.di-studio.xyz switched off

- Renamed the dev tier's machine identifiers from `staging` to `dev`: `docker-compose.dev.yml`
  (project `dii-dev`, container `dii-dev-server-1`, volume `dii-dev_data`),
  `.github/workflows/deploy-vps-dev.yml` (environment `dev`, tags `dev`/`dev-<sha>`,
  `deployEnv` `dev`), env `DEV_*` / `VPS_DEV_*`, `/opt/di.iiii-dev`, `DI_TOKEN_DEV`, manifest
  `tiers.dev`, `sync-space-to-dev.sh`, `cleanup-plans/dev.json`. The `staging` aliases from #471
  are gone; a CLI handed `staging` fails with `"staging" is now "dev"`. Map in
  `docs/ai/vocabulary.md` (amendment 2026-09-16).
- `staging.di-studio.xyz` is switched off (Caddy block removed, DNS record deleted), done after
  the dev OAuth callbacks moved to `dev.diiii.xyz` and the owner tested Google + GitHub sign-in
  there. Host matchers no longer accept `staging*`.
- The VPS migration (checkout dir, data volume copy to `dii-dev_data`, `.env` names, GitHub
  vars) is done by hand at merge time, to match these names.
- Prod's `.env` carries both `STAGING_DOMAIN/PORT` and `DEV_DOMAIN/PORT` until the next
  dev→main promotion updates prod's Caddyfile/compose; then the `STAGING_*` lines are removed.
- Left for the owner: the legacy cPanel pipeline (dead since 2026-07-15) and the Android
  package id `xyz.distudio.chat.staging`.
