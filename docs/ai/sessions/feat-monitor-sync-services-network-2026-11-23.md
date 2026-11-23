## 2026-11-23 — the Monitor's Network and Services boxes are the same on every machine

- The owner compared the Monitor on studio-mac and aylmo: "it still not the same", then "make that be synced". Network (6 vs 2 probes) and Services (32 vs 22) were each machine's own.
- `machineRowsFor` in monitorHub.js: own rows first, then each other fresh machine report's rows (reports the hub already holds, nothing probed), each tagged `machine`, id `<machine>/<probe id|unit>`; stale, failed or keyless lists are skipped; at most 80 rows per other machine; running/failed recounted.
- Page: rows keyed by id, "· <machine>" on each row, box subtitle names the machines (`machinesSubtitle`). Wiki Monitor article updated.
- Checked on a test copy with real reports: network 12 rows from 4 machines, services 58 from 3, ids unique; headless pictures at 2560, 1280 and 412 wide, 0 cut labels, no sideways scroll.
