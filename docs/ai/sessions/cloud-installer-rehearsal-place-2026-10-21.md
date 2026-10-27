## 2026-10-21 — `di update` rehearses next to the data, skips snapshots, and logs why it failed

- Measured on one install: from 2026-10-21 20:45Z `di update` failed every 15 minutes with EDQUOT (-122). The rehearsal copied 7.4 GB (4.2 GB of it `snapshots/`) into `/tmp`, a quota tmpfs that `TMPDIR` cannot redirect (setcap node binary → AT_SECURE).
- Rehearsal, download and smoke folders now live in `<di home>/scratch/`; the rehearsal skips the top-level `snapshots/` (checked: serverXR touches `snapshotsDir` only on history requests) and uses copy-on-write clones where available. The scratch is removed in a `finally` on every path.
- `autoupdate.log`, `lastError` and `di autoupdate status` now carry the failure reason, not the "update failed, still on X" line after it.
- Tests: 3 new cases fail on dev and pass here (snapshots skipped, scratch under home with TMPDIR canary, reason logged). Not tested: a real reflink filesystem, a real 7 GB root, the `di update` CLI end to end.
- Undone: folders earlier runs left in `/tmp` stay until someone removes them; 4 `oneAddressPrinted` cases and the `openFile` suite fail on dev here too, unrelated.
