## 2026-10-10 — A purged space takes its restore points with it; a restart no longer adds one

- `deleteSpace` removes `data/snapshots/<space>/`. The idle account sandbox archive keeps them on purpose (revival reads the snapshot back). A trashed space still keeps everything: only the purge deletes.
- The start-up and daily restore point of the open space is skipped when the newest one is under 23 h old.
- Owed: orphans already on disk from earlier deletes are not swept (no space row, folder remains); a one-off sweep script could list `snapshots/*` without a space row.
