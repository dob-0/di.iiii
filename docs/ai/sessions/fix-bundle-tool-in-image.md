## 2026-09-17 — the server image ships the bundle tool, so save-to-file and open-a-file work on hosted tiers

Found while moving Emilya's WCC export between installs.

- `GET /api/spaces/:id/bundle` and `POST /api/spaces/bundle` spawn `scripts/space-bundle.mjs`.
  `serverXR/Dockerfile` copied only `serverXR/src`, `serverXR/public` and `shared/`, so
  `bundleToolPath()` found nothing and both routes answered 500 *"Could not save this space
  to a file."* on diiii.xyz AND dev.diiii.xyz — from the day the file menu shipped
  (2026-08-19) until now. Nothing reported it; the browser just showed the sentence.
- Now: the Dockerfile copies the script to `/app/scripts/`, and the script finds the
  server at `./src` when there is no `serverXR/` above it (the image layout), else at
  `serverXR/src` (a checkout, an installed runtime). `writerStamp()` reads
  `SCHEMA_VERSION` from the same place, so a file written by a hosted tier carries its
  schema version instead of `null`.
- `scripts/space-bundle.test.js` stages the image layout from the real files and runs an
  export + import through it, and asserts the Dockerfile's COPY line — either half
  regressing fails the test. Checked the other way too: the pre-fix script in that
  layout writes `schemaVersion: null` and its import dies on `../serverXR/src/db.js`.
- Not changed: the import route still never passes `--force`, so a `.diiii` for a space
  that already exists on the tier is refused with 409. Replacing a live space in place
  stays a CLI job (or the proposals route from `feat/space-proposals`, PR #486).
- Emilya's newest WCC export (her fork's release `wcc-space-2026-09-17`) is on PROD since
  2026-09-17, put there by hand: the fixed tool copied into the running container, then
  `import --force --force-stale`. It was meant for dev first and landed on prod because a
  plain `docker compose` inside `/opt/di.iiii-dev` addresses project `dii` (prod) unless
  `-f docker-compose.dev.yml` is passed. Prod's before-copy is kept off the VPS. Dev still
  carries the old lineage; the space's label and owner are re-set by PATCH after an import,
  since a `.diiii` carries neither.
