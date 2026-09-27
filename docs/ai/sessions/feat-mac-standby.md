## 2026-09-27 — prod and the dev tier run natively on a standby host that pulls its own deploys

- `scripts/standby/` (build-runtime, restore-data, server-env, nginx-conf, backup-data) builds and
  runs prod's own commit without Docker, laid out like the two prod images, for a warm standby that
  now serves production. Host-specific parts (paths, service users, tunnel, the pull-deployer) are
  kept out of this repo.
- `deploy-vps.yml` / `deploy-vps-dev.yml` read the repository variable `DEPLOY_TARGET` (`vps` |
  `mac`, default `vps`, so this merge changes nothing by itself). With `mac` the deploy job keeps its
  environment gate, skips SSH and ends green; the host deploys that green run's commit itself. See
  `docs/deploy/VPS_DOCKER_DEPLOY.md`.
- `server-env.mjs` takes `--compose` more than once (Compose merge order) and honours `${VAR:?}`, so
  the dev tier's env comes from `docker-compose.yml` + `docker-compose.dev.yml` exactly as its
  container's did. Byte-identical output to the previous generator on all 10 compose versions since
  2026-07-27; `scripts/standby/server-env.test.js` (4 tests) runs it on the repo's real compose files.
- Owed: the `/serverXR/api/follows` loopback-trust fix (behind a same-host proxy every caller is
  loopback); a CI contract test running `backup-data.sh` then `restore-data.sh`.
