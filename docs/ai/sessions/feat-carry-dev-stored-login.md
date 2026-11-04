## 2026-11-02 — di sync --push: local to dev from the CLI, with the stored di login

- Owner's flow: work on local, push to dev, sync all in dev, then main. `di sync` only audited (cmdSync said `--push/--pull` were later PRs); this is the push half. Dev to main stays the release path.
- `di sync <space> --push [--apply] [--remote URL] [--skip space/project,..]`: dry-run by default, lists the projects it would write; with a link the audit runs first and `--apply` is refused on any unprovable item. It runs `scripts/tier-sync.mjs` (staleness/overwrite checks), now packed beside the CLI.
- `scripts/stored-login.mjs`: tier-sync and space-proposal read the dev session `di login` keeps in `~/.config/di/credentials.json` when `LIVE_API_TOKEN` is absent. Dev only (prod keeps its window), refuses an expired or group/world-readable file, never prints the token.
- `tier-sync --skip` refuses a bare project id (it was read as a space name, held nothing back, and a real carry overwrote dev's floor/hall projects on 2 Nov). `DI_DEV_BASE` reaches the dev server another way (an ssh forward to the Mac's :8081) while dev's public name is held by the Mac tunnel-guard whenever the Pi serves prod.
- `scripts/dev-sync.sh <space> [--apply]`: the same flow for a checkout, opens and closes that forward itself.
- Tested: vitest 77 pass / 1 skipped (syncPush 4, stored-login 5, tier-sync, packProfile); `di sync cinema-house --push` dry-run end to end through the forward listed the floor and hall and wrote nothing. Not tested: `--apply`, a built pack running it.
- Owed: dev's own Cloudflare tunnel (the public dev name is down while the Pi serves prod), compare dev floor/hall with local before the first apply.
