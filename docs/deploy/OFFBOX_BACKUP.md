# Off-box backup

Until 2026-07-29 every copy of production lived on one Hetzner box. The nightly
job (`deploy/vps-backup.sh`) wrote `/root/backups/dii-backup-*.tar.gz` and pruned
after 14 days — a real backup against *accidents inside the app*, and no defence
at all against losing the host. Disk failure, a mistaken `rm -rf`, a hosting
account lockout, or ransomware took the database, every upload and every space
in one move.

`scripts/backup-pull.sh` closes that: it copies the archives onto a second
machine.

## Why pull, not push

The obvious design is for the VPS to push to object storage on a schedule. Don't.
Pushing means the VPS holds write credentials for the backup store, so whoever
owns the box owns the backups — and deleting the off-box copies is step one of
any competent ransomware.

This script inverts it. **The VPS holds no credential to the backup machine and
cannot initiate a connection to it.** The trust arrow points one way: the backup
machine reads the VPS. Compromising production does not get you the backups.

The cost is that backups only advance while the pulling machine is online. That
is the right trade for a laptop-and-one-VPS setup; if this ever moves to
always-on storage, keep the pull direction and run it from there.

## Usage

```bash
scripts/backup-pull.sh                # pull anything new, verify, prune
scripts/backup-pull.sh --dry-run      # show what would transfer
scripts/backup-pull.sh --verify-only  # re-check local archives, no transfer
```

Configuration is environment-driven, with working defaults:

| Var | Default | Meaning |
| --- | --- | --- |
| `DII_VPS_HOST` | `dii-vps` | ssh target (uses your ssh config) |
| `DII_VPS_DIR` | `/root/backups` | remote archive directory |
| `DII_BACKUP_DEST` | `~/di-backups` | where copies land |
| `DII_KEEP` | `30` | local archives retained |
| `DII_MAX_AGE_H` | `36` | staleness threshold for the newest archive |

Local retention is deliberately longer than the VPS's 14 days — outlasting the
source is the entire point, and local disk is cheap. At ~700 MB/archive, 30
copies is roughly 21 GB.

## What it checks

- **Reachability** — a failed ssh exits 1 rather than silently doing nothing.
- **Staleness** — if the newest *remote* archive is older than `DII_MAX_AGE_H`,
  it exits 4. A cron that quietly stopped looks identical to a healthy one until
  the day you need a restore; this is the only thing that catches it.
- **Integrity** — `gzip -t` walks the full stream and checks the CRC, so a
  truncated or bit-rotted archive fails now instead of during an emergency.
  Exits 3.
- **Concurrency** — `flock`, so a timer firing during a slow run is a no-op
  instead of two rsyncs fighting over the same partial file.

Exit codes: `0` ok · `1` usage/precondition · `2` transfer failed ·
`3` integrity failed · `4` backups are stale.

## Running it automatically

A systemd **user** timer, so it needs no root and runs whenever the machine is
up. `WantedBy=timers.target` plus `Persistent=true` means a missed run (laptop
asleep at the scheduled time) fires shortly after the next login.

`~/.config/systemd/user/di-backup-pull.service`:

```ini
[Unit]
Description=Pull di.iiii production backups off the VPS

[Service]
Type=oneshot
ExecStart=%h/di.iiii/scripts/backup-pull.sh
```

`~/.config/systemd/user/di-backup-pull.timer`:

```ini
[Unit]
Description=Daily off-box pull of di.iiii backups

[Timer]
OnCalendar=*-*-* 09:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now di-backup-pull.timer
systemctl --user list-timers di-backup-pull.timer   # confirm it is scheduled
journalctl --user -u di-backup-pull.service -n 50   # read the last run
loginctl enable-linger "$USER"                      # run without being logged in
```

Schedule it *after* the VPS job (`17 3 * * *` UTC) has finished, so each pull
picks up that morning's archive.

## Restoring

The archives are exactly what `deploy/vps-backup.sh` produced, so the existing
`deploy/vps-restore.sh` path applies unchanged — copy the chosen archive back to
the VPS and restore from it. See `docs/deploy/VPS_DOCKER_DEPLOY.md`.

Each archive contains `.backup-snapshot.db` (a WAL-safe `VACUUM INTO` snapshot),
plus `uploads`, `spaces` and `snapshots` from the `dii_data` volume.

Inspect one without a full restore:

```bash
tar tzf ~/di-backups/dii-backup-YYYY-MM-DD_HHMM.tar.gz | head
```

## Known gaps

- **Not encrypted at rest.** The archives contain the full `users` table,
  `open_call_applications` (names, emails, phone numbers), and encrypted Drive
  tokens. On an encrypted-disk laptop that is acceptable; copying them anywhere
  else means adding `age`/`gpg` encryption first.
- **Only advances while the pulling machine is on.** See the trade-off above.
- **A restore can resurrect deleted data** — there is no exclusion mechanism.
  Relevant the moment an account-deletion path exists; see
  `docs/ai/privacy-data-inventory.md`.
- **`deploy/vps-backup.sh` is not deployed by anything.** The live copy at
  `/root/vps-backup.sh` is kept in sync by hand.
