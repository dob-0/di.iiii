# feat/open-to-in-parts — `di open FILE --to URL` in parts

## What

`di open FILE --to URL` now carries a space file of any size (up to the target's `MAX_BUNDLE_MB`, default 4096) by sending it in parts of 64 MB (`BUNDLE_PART_MB`). Files up to 90 MB still use the one multipart POST; an older server that answers 404 on the new start route is handled (see below).

## Why

`platina.diiii` is 843 MB. dev.diiii.xyz sits behind Cloudflare, which refuses any single request body over 100 MB (see `feat-place-add-sources-2026-10-04.md`, "Cloudflare 413 above 100 MB"; the server's own cap is `MAX_UPLOAD_MB`, default 100). The CLI answered "platina.diiii is bigger than dev.diiii.xyz takes over the wire". Each part here is its own request, well under the limit.

## How

Server (`serverXR/src/routes/bundleParts.js`, registered from `routes/spaceRoutes.js`):
- `POST /api/spaces/bundle/uploads` start `{size, sha256, name, as?, label?}` -> `{uploadId, partBytes, parts}`
- `PUT .../uploads/:id/parts/:n` raw bytes; exact part size (last = remainder); optional `x-part-sha256`
- `POST .../uploads/:id/finish` answers **202 at once**; a background job joins the parts (deleting each part once copied: peak disk about 1x the file), checks total size + sha256, then calls `importBundleFile` — the SAME function the single `POST /api/spaces/bundle` now calls (extracted, not copied), so `space_exists` (409), `as`, the similar-name guard and the tool's refusals are unchanged and reach the CLI with their code. A second finish while one runs: 409 `already_finishing`. Missing parts: 409 `parts_missing` at once.
- Why 202: Cloudflare waits 125 s for an origin's answer by default, then answers 524; only Enterprise can raise it. Source: https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-524/ (read 2026-11-12; the page says 125 s "Proxy Read Timeout", not 100 s). Joining + importing 843 MB can exceed that.
- `GET .../uploads/:id` (owner only) -> `receiving | joining | importing | done {spaceId, space} | failed {httpStatus, error, code, ...}`; a job left over from a server restart reads as `failed`/`interrupted`. The CLI polls every 3 s (`DI_OPEN_TO_POLL_MS`), total 30 min (`DI_OPEN_TO_FINISH_TIMEOUT_MS`), tolerates 5 dropped polls in a row, then DELETEs the upload.
- `DELETE .../uploads/:id` cancel (409 while the job runs)
- Disk: start answers 507 `insufficient_storage` when free space on the uploads disk (`fs.statfs`) is below 2 x size + 1 GB.
- Owner: `who()` is `<auth type>:<subject>`, no fallback; a login with no subject gets 403 at start. Checked in `index.js`: session subject = user id (optional in a legacy cookie session, hence the refusal), token identities always get one (config falls back to the role name, so two holders of the same configured token share it by design), sync key = `sync-key:<keyId>`, local owner `local-owner`, auth off `auth-disabled`.
- Dev server env (read, not guessed): `.github/workflows/deploy-vps-dev.yml` checks out only the compose files and leaves the host's `.env` alone; `docker-compose.yml` passes `MAX_BUNDLE_MB` / `BUNDLE_PART_MB` with defaults 4096 / 64, so dev needs no env change. `scripts/write-server-env.mjs` writes the cPanel env only (used by `scripts/cpanel-apply-prebuilt-release.sh`); the two vars are added there as optional values.
- Auth: the same `mayOpenAFile` check as the single route (extracted from it), on every step; an upload is bound to the account that started it. Who may create a space is not widened.
- Parts live in `<uploadsDir>/bundle-parts/<id>/` on disk, never in memory. Part and joined files are removed when the job ends (success or refusal); only `meta.json` + `status.json` stay until the CLI's DELETE, cancel, or 24 h (sweep on every start + hourly). A finish with parts missing answers 409 `parts_missing` and keeps the upload so the sender can add them. At most 8 uploads in flight (429).
- Env: `MAX_BUNDLE_MB` (4096), `BUNDLE_PART_MB` (64, capped at `MAX_UPLOAD_MB`) in `.env.example` and `docker-compose.yml`. Not added to `scripts/write-server-env.mjs` / cPanel scripts: defaults apply there.
- The `/api/spaces/:spaceId` scope gate treats `bundle/uploads…` like `POST /api/spaces/bundle` (`isOpenAFile` in `index.js`).
- Catalogue: four entries (`agent: false`).

CLI (`scripts/di/cli.mjs`, words in `ui.mjs`): above `DI_OPEN_TO_SINGLE_MAX_BYTES` (default 90 MB) hash the file, start, PUT each part (3 tries, `DI_OPEN_TO_RETRIES`; refusals that cannot change — 401/403/404/413 — are not retried), cancel the upload if a part never goes through, finish. Dim progress line per part. 404 on start: if the file fits the old 100 MB limit the single POST is used; otherwise "this di.iiii is older and takes only files up to 100 MB".

## Tested (run in this worktree)

- `npx vitest run serverXR/src/bundlePartsContracts.test.js` -> 7 passed (real server child, parts of 104 bytes): happy path with `as`, space_exists 409 via parts, wrong sha256 refused + parts removed + nothing opened, missing part refused then completed, wrong-size part, over `MAX_BUNDLE_MB`, cancel, auth refused with `REQUIRE_AUTH=true`.
- `npx vitest run scripts/di/openToParts.test.js scripts/di/openTo.test.js serverXR/src/routes/bundleParts.test.js` -> 25 passed (CLI picks parts above threshold, retries, cancels, falls back on 404, says "older" above 100 MB; expiry sweep).
- `npx vitest run scripts/di serverXR/src/bundleContracts.test.js serverXR/src/bundlePartsContracts.test.js serverXR/src/routes/bundleParts.test.js serverXR/src/catalogueContracts.test.js serverXR/src/config.test.js serverXR/src/httpContracts.test.js` -> exit code 0, 56 files, 859 tests passed, no FAIL lines. New in this round: 202 + poll + already_finishing + owner-only GET (contracts), 507 with injected statfs, subject-less login refused, other owner refused, parts deleted while joining (unit), CLI polling: done, failed with code, dropped poll, total timeout.
- `npx eslint` on the touched files: 0 errors; 4 warnings in `serverXR/src/index.js` lines not touched here.

## NOT tested

- A real run against dev.diiii.xyz or through Cloudflare: needs this merged and deployed. Real 64 MB parts and an 843 MB file were never written here.
- Behaviour when the proxy's own timeout hits mid-part (each part has a 30-minute client timeout, `DI_OPEN_TO_TIMEOUT_MS`).
- Not done: resuming an interrupted run (a failed part cancels the upload; run the command again). Parts on disk allow it later.
