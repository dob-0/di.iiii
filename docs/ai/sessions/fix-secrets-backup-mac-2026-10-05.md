## 2026-10-05 — secrets backup pulls from the Mac, keeps a second copy on asuz

- **What.** `deploy/secrets-backup.sh` now reads production's secret files from the Mac (`SOURCE_HOST`, default
  `di-mac`; `VPS_HOST` still honoured) and, after writing the `.age`, copies that encrypted file to asuz
  (`~/di-backups/secrets/`, host `asuz` on the LAN, then `asuz-ts`), compares sha256 on both sides, and prunes to
  `SECRETS_KEEP` (14) on both. `SECOND_HOST=none` turns the second copy off. Any failure prints `FAILED: <why>` and exits 1.
- **Why.** The VPS is offline and unpaid, so the nightly timer failed every night. Newest bundle before this was 2026-09-24.
- **Paths (names only, read as user `non` over ssh).** `/usr/local/di-standby/etc/source.env` (prod .env),
  `/usr/local/di-dev/etc/source.env` (dev .env), `/usr/local/di-bo/etc/bot.env` (di.bo), prod `tunnel.yml`, tunnel
  credentials json, `nginx.conf`. No compose or Caddy file exists on the Mac (compose lives in the repo). The three
  .env members keep their old bundle names because di-atlas `tools/standby-deploy.sh` reads `opt-di.iiii--.env` from the newest bundle.
- **Measured.** `--check` captured 6 of 6; real run wrote an 8.0 KB bundle; sha256 `2f5b4c58a912…` identical on aylmo and asuz;
  decrypt test in `/dev/shm` listed 6 files + MANIFEST, then deleted.
- **Limits.** Recipients are aylmo's key and `di-mac`'s backup key; asuz holds the file but no key of its own, so it opens
  only with one of those two. The Mac key lives on production's own disk. `asuz-ts` is blocked by Tailscale SSH check mode; the
  LAN name `asuz` works only while aylmo is on 192.168.88.0/24. The unit's ExecStart points through `~/di.iiii` (the old checkout) — the install path is the owner's call.
