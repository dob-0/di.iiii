## 2026-09-24 — NDI autoscan: a local di.iiii always knows which NDI sources are on the network

- Owner: "we need auto scan mode of ndi … what there are the ndi signals in net now".
- Method is the NDI SDK's own continuous discovery (SDK Documentation §14 NDI-FIND,
  `Processing.NDI.Find.h`): ONE long-lived finder in the existing forked child; the
  manager keeps that child alive while scanning and folds each list into a registry
  (`serverXR/src/ndi/scanner.js`: firstSeen / lastSeen / goneSince, appear/gone/changed diff,
  3 s settle window so a young finder never announces departures).
- New routes: `GET /ndi/api/scan` (snapshot, `?wait=`) and `GET /ndi/api/scan/events`
  (SSE). States `off · starting · running · restarting · no-runtime · error`; `count` is
  null unless running — no surface ever says "0" when it cannot look.
- Starts at boot when `DI_LOCAL=1` (`DI_NDI_SCAN=0` off, `=1` on for dev). New
  `DI_NDI_GROUPS` → `p_groups`. A finder the runtime refuses is now a fatal, and a finder
  that errors exits the child so it is restarted — never a silently frozen list.
- Pages: `watchNdiScan` (one feed per page; the wall `/out` polls every 5 s so it holds no
  connection its pictures need); `useMachinePresence` re-reads devices on every change, so
  the NDI picker, the map's Machines section and the Raw desk update live. New line
  "NDI on the network: N" in the map's Machines section and the Raw desk; the Raw desk
  lists NDI sources per machine (existing classes, no restyle).
- CLI: `di ndi scan [--watch] [--url …]`.
- Measured on aylmo (i7-11800H, libndi 6.3.2.0, same-machine sender, 10 runs): appeared
  793/891/1008 ms (min/median/max after the sender existed); gone after SIGTERM
  1004/1007/1011 ms, after SIGKILL 1006/1013/1014 ms; browser readout 0→1 in 1.15 s, 1→0
  in 1.05 s, desktop and phone. Idle child 0.07 % of a core, 78 MB RSS.
  Harness: `scripts/ndi-autoscan-measure.mjs`. Full table: `docs/architecture/NDI.md` → Autoscan.
- NOT proven: a sender on another machine (especially one that dies without a goodbye),
  Windows, macOS, a second subnet, a Discovery Server, `DI_NDI_GROUPS` against a real group.
  Not seen in the owner's own browser at local.thedi.studio — the running install was not
  touched (another session owns it); seen in Playwright Chromium against a dev server.
