## 2026-09-13 — backup-pull could not see its own archives through a symlinked destination

- On aylmo `~/di-backups` is a symlink into `/mnt/nobara-home`. `find "$DEST"` and `du -sh "$DEST"`
  do not follow a symlink given as the start point, so the pull logged `0 archive(s) held locally, 4.0K`
  while 30 archives (22G) were there.
- The same `find` feeds the prune list, so pruning to `DII_KEEP` (30) silently never ran: the local
  chain would have grown without bound. The pull and integrity check were unaffected (they use `"$DEST/"`
  or a glob).
- Fix: `"$DEST/"` in all three places. Checked against the real directory: old form 0 / 4.0K, new form 30 / 22G.
