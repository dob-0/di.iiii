# `di sync` — a directional mirror that refuses what it cannot prove

Status: v1 shipped = `di link` + ledger + the read-only audit (`di sync <space>`).
`--push`/`--pull` over ops and `--replace-*` over bundles are later PRs.
Design source: the phase-2 plan (2026-08-10); server-side prerequisites landed in
PR #119 (`?verbatim=1`, `If-Match` on `PUT /scene`, sync routes that refuse).

## The two facts everything follows from

1. **Scene ops have no inverse.** There is no three-way merge available and no
   honest way to fake one. So sync is a *directional mirror with a mandatory
   diff*, not a merge — and the diff refuses every case it cannot prove.
2. **`version` is a per-install counter and ops carry no origin.** Local v40
   and online v40 are unrelated numbers. Nothing in the data can say "these
   two spaces share history."

## The ledger is the origin field the ops do not have

`~/.di/data/sync/<remote-slug>/<space>.json` — under `data/` so `di backup`
carries it and `di update` cannot touch it. One file per (remote, space), so a
space linked to staging and prod can never share cursors. It records:

- `installId` — minted once into `~/.di/state.json` on first link
- `cursors` — `{ localVersion, remoteVersion }` at the last successful sync;
  **null until a first `--push`/`--pull` establishes a baseline**
- `opIdsSent` / `opIdsReceived` — replay dedupe (server's idempotency guard
  keys on opId)
- `assetIdRemap` — local sha256 → remote sha256. EXIF scrubbing re-encodes
  bytes, so the same photo hashes differently per install; without the
  persisted remap every sync re-uploads every image forever, and the audit
  would double-count re-encoded images as different on each side.

## Relation semantics (sync-plan.mjs, pure)

Only the cursors can anchor a relation. Each side answers one provable
question — "did this side move since the cursor?" — giving five states:
`unknown` (no cursors), `in-sync-as-of-last-sync`, `local-ahead`,
`remote-ahead`, `diverged`. `diverged` refuses both directions outright: with
no op inverse, nothing can prove whose history wins.

The retention wall is checked per direction: a side whose oldest retained op
(`opsFloor`) no longer reaches its cursor can only move as a bundle
(`MAX_OP_HISTORY` 500 / 30 days), and the audit says so up front.

## Reads are verbatim or refused

`GET /scene?verbatim=1` returns stored bytes plus `missingAssetIds`. An old
server ignores the query and answers its filtered, URL-rewritten rendering —
identical *apart from that key* — and copying that back is the
manifest-erasure bug. `missingAssetIds` present = proof; absent = the side is
marked non-verbatim and every future write path treats that as a hard stop.

## Credentials

`space_sync_keys` (`dii_sync_<keyId>.<secret>`, editor role scoped to one
space, revocable) — minted in the space settings online, pasted into
`di link <space> --remote <url>`, **verified against the remote before
anything is stored** (reachability, key acceptance, space existence, verbatim
support). Stored 0600 in `~/.di/credentials.json`, which is deliberately
outside `data/` (backups must not carry live keys) and is removed by
`di uninstall`. The key also rides along on local reads — a stock install
runs authless and ignores it; a local server with auth enabled would
otherwise 401 on exactly the space that was just linked.

## Protocol

**No new server endpoints.** `GET /scene?verbatim=1`, `GET /ops?since=`,
`POST /ops` (with `baseVersion`), the asset routes, and `space_sync_keys` are
the whole protocol. Wanting a new route means the design drifted.

## Files

- `scripts/di/sync-plan.mjs` — every refusal decided here; pure, unit-tested
  with no server (`syncPlan.test.js`)
- `scripts/di/sync.mjs` — all I/O; bounded, non-throwing fetches
- `scripts/di/ledger.mjs` — ledger + installId (`syncLedger.test.js`)
- `scripts/di/credentialsStore.mjs` — 0600 key store (`credentialsStore.test.js`)
- `scripts/di/cli.mjs` `cmdLink`/`cmdSync` + `scripts/di/ui.mjs` strings
