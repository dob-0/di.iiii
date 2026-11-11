## 2026-11-10 — Platina: the patch of the 50 lights, and a patch plan that carries its own types

- The owner asked for the addresses of the Platina lights (ledger N3531). The Platina side has no patch; the light plot's
  legend gives 11 A.leda B-EYE K10, 7 Sharpy, 8 HY B-EYE K15, 24 Pixel Line IP and nothing else (no universes, no modes).
- `scripts/place/rigs/platina-2026-11-10.patch.json`: U1 the K10 (001–385), U2 the Sharpy (001–140) and the K15 (201–488),
  U3 the Pixel Line bars (001–504). Each unit in its smallest mode, standing one larger mode apart (`pitch`).
- `patch-table.mjs` reads a plan's own `types` (`libraryWithPlan`) and plans with `footprintOnly`: addresses from a sourced
  channel count, the channel list said as owed. A desk patch is unchanged. RIG_BUILD.md §19.5.1.
- Channel counts read 2026-11-10: K10 21/35 and Sharpy 16/20 from Open Fixture Library; K15 22/36 from the Claypaky
  datasheet (which count is which mode: ASSUMED from their order); Pixel Line IP 7/15/17/21/… from a rental listing only.
- Still undone: nothing is confirmed by the Platina side (modes on the units, the maker of the Pixel Line IP, who runs the
  desk, the node). No project document holds these lamps yet; no desk was patched. In this worktree
  `scripts/rigbuild/laserPlayToken.test.js` does not load (`Cannot find module 'express'`), not touched by this branch.

- 2026-11-10 21:22: `--lang ru` for the patch sheet (owner N3541): WORDS table in patch-table.mjs, `_ru` keys in the Platina plan, 1 test; RU PDF 5 pages. Still a DRAFT on hold until the crew patch list arrives.

- 2026-11-11 16:32: full-mode plan from the rental offer (owner N3655): new file platina-2026-11-11-full.patch.json (52 units, 9 universes: K10 35 ch, XP-16R BSW 23 ch unverified, K15 76 ch, Pixel Line IP 117 ch), 1 test; the small-mode draft is kept. Sheets in ~/work/platina/patch-2026-11-11-full (EN + RU, 11 pages each).
