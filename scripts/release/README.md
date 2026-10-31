# scripts/release — release record, install gate, show-live freeze, hot swap, restore, drill

Built 2026-11-01 for audit slice S10 (gaps G05 and G27 in `agent-reports-2026-11-01/audit-show-day/GAPS.md`).
It replaces di-atlas `tools/projector-room/install-look.sh` and `ui-hot-swap.sh`. Those become thin callers, then retire.
Nothing here names a production: `--production <name>` is always given.

## The night it comes from (2026-11-01)
- 01:12. The 16b ui went live through `ui-hot-swap.sh`. Its review said BLOCK on M1 and M2, and the swap window said BLOCK 0 times.
- No test run on the 16b merge.
- The hot swaps wrote new ui files into `versions/0.4.4-look.e3ca4567`, so `di version` still named the build before.
- 0 rollback rows stood against 11 installs forward.

## Commands

| step | command |
|---|---|
| keep a test run | `node scripts/release/record.mjs tests -- npx vitest run <paths>` (at HEAD, clean tree) |
| write the record | `node scripts/release/record.mjs pack <di-runtime-…tar.gz> [--commit <sha>] [--review <review.md>]` |
| what the gate says | `node scripts/release/record.mjs show <pack>` |
| show live on / off | `node scripts/release/show-live.mjs on\|off\|status --production <name> --why '<text>'` |
| install a full pack | `node scripts/show/install.mjs <pack> --production <name> --host <user@host> [--accept '<reason>']` |
| hot swap the ui | `node scripts/show/hot-swap.mjs <pack> --production <name> --host <user@host> [--when-up] [--checkpoint-cmd …] [--go-cmd …]` |
| undo the last swap | `node scripts/show/hot-swap.mjs --undo --production <name> --host <user@host>` |
| restore a release | `node scripts/release/restore.mjs --manifest <release-manifest.json> --production <name> --host <user@host>` |
| rollback drill | `node scripts/release/drill.mjs --home <replica DI home> --production <name> --base <full pack> --overlay <pack>` |
| the label | `di version` (`--json` lists the overlays) |

`--home <DI home>` in place of `--host` works on a DI home on this machine: a replica, or the tests.
On a replica, set `DI_SHOW_UPDATE_CMD="node scripts/release/replica-update.mjs --home {home} --from {pack}"`.
The drill sets it for you.

Exit codes: 0 ok · 2 usage · 3 a sha256 does not match (nothing changed) · 4 refused by the gate · 5 the target did not answer · 6 the target refused or failed · 7 the checkpoint failed · 8 NO-GO in the soak (the overlay is undone) · 9 the restored label differs from the manifest.

## The record (method: in-toto Statement v1, own predicate)
`<pack>.release.json`, with a copy in `~/di-health/release/records/<sha256>.json` (`DI_RELEASE_DIR`). It is a Statement:
- `_type`: `https://in-toto.io/Statement/v1`.
- `subject`: the pack name and its sha256.
- `predicateType`: `https://diiii.xyz/attestations/release-record/v1`. This URI is a name only, not a published page (owed).
- `predicate`:
  - `attestation: "self-attested"`, `recordedAt`, `recordedBy`, `builtAt`;
  - `pack {version, kind, entries}`;
  - `commit` and `commitFrom`;
  - `remote {onRemote, refs, refCount, fetched, checkedAt}`, after a `git fetch`;
  - `tests {result, passed, failed, command, commit, clean, exitCode, ranAt, log}`;
  - `review {file, sha256, verdict, verdictLine, mustFixOpen}`.

Why a Statement: SLSA provenance has no field for tests or review. The in-toto Statement is the generic envelope for such claims (audit RESEARCH-left-behind G1, sources S1-S4 there).

Self-attested means the same lead builds the pack and writes the record. That is close to SLSA Build L1: it proves consistency, not independence. The line says so every time.

The gate recomputes the digest and refuses a record for another pack. A missing or unknown field also refuses. SLSA verification says unrecognised parameters SHOULD fail.

## The gate
- **Outside a live show** it refuses a build that is BLOCKed, untested, or on no remote branch, unless `--accept '<reason>'` is given.
  - Untested means no green "Tests N passed" with N > 0 on the exact commit, from a clean tree.
  - Every attempt is a line in `~/di-health/show/<production>/installs.log` (`DI_SHOW_DIR`), with the reason of every override.
  - This is stronger than Binary Authorization's boolean break-glass label, which logs every break-glass deploy but carries no reason.
- **While the show is live** (the `LIVE` flag), the freeze is hard and `--accept` cannot lift it:
  - no full install;
  - a ui overlay needs a matching record, green tests on the exact commit and no BLOCK;
  - a checkpoint first (`--checkpoint-cmd`), and a GO soak after (`--go-cmd` or the built-in page + laser check, default 60 s);
  - a NO-GO in the soak undoes the overlay at once.
  - This maps onto ITIL 4's emergency-change minimum: the same testing, assessment and authorization, while documentation may follow (RESEARCH-show-safety §7, secondary source).
  - The "ui-only overlay" class itself has no source: **unvalidated**.
- `--when-up` runs the whole gate again at the moment the target answers. Tonight's take 4 would have fired mid-show on a 90-minute-old check.
- A hot swap refuses a pack whose `shared/` files differ from the live release. The running server has loaded them, so they need a full install.

## The hot swap (method: OSTree `--hotfix` clone + Capistrano revisions log)
`target.py` takes these steps on the show machine:
1. Clone the live release folder (`cp -a --reflink=auto`).
2. Lay the ui bundle over the clone.
3. Check every ui file against the bundle's sha256 manifest, and remove the ui files the pack no longer has.
4. Append one JSON line to `PATCHES` (the new file is checked to be the old one plus one line).
5. Keep the bundle in `overlays/<id>.<sha8>.tar.gz`.
6. Exchange the two folders' paths in one `renameat2(RENAME_EXCHANGE)`.

Why exchange, not move `current`: the running server serves the desk pages from the real path of its release folder, because node resolves a module's symlinks at start. Moving `current` would change nothing until a restart, and a hot swap must not restart.

After the swap:
- the live path holds the new release;
- the release before stays whole beside it, as `<release>.before-<id>-<stamp>`;
- `--undo` exchanges them back and keeps the undone one as `.undone-…`.

On a filesystem without `renameat2` it falls back to three renames and says "NOT atomic".

The label is `<base version>+<id>` for each PATCHES line, for example `0.4.4-look.e3ca4567+ui.63d9dc1d+ui.7080f534`. It is derived, never typed. The id is `ui.` plus the commit's first 8 hex from the record; with no record, the manifest's sha8.

`installedVersion()` stays the base version, because update and rollback compare base versions.

`release-manifest.json` in the DI home is rewritten after every install, swap and undo. A checkpoint keeps a copy, and `restore.mjs` puts that state back from files that stay on the target:
- `packs/<pack>`;
- `overlays/<id>.<sha8>.tar.gz`.

Every sha256 is checked before anything is touched.

## Limits (stated, not hidden)
- **Not run against a real show machine.** The stage Mac is live. The ssh route (`--host`), the rsync copy, the Hyprland F5 reload and the served-file check are carried from the scripts that ran on it on 2026-10-31/11-01, but this code has run only on aylmo. The first real install through the gate is the owner's window, after the show.
- **The drill covers less than a real update.** It uses `replica-update.mjs`: the same unpack, `activate()` and `pruneVersions()` as `di update`, but no `npm ci`, no smoke test and no service restart.
- **The drill's times were measured on aylmo, on tmpfs.** They are not the Mac's disk.
- **The drill does not read the laser yet.** The laser state is read only when `--laser-url` points at a server that serves the replica.
- **The 60 s soak is unvalidated.** S13 owns `di show go`. Until then the built-in check is "the three desk pages answer 200 and the laser state reads".
- **Clone cost.** A clone is a full copy where the filesystem has no reflink: 136 MB per swap for the 0.4.4 release measured here. `di update` prunes the `.before-` and `.undone-` folders; the bundles in `overlays/` stay.
