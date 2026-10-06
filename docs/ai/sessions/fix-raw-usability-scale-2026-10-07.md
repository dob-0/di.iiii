## 2026-10-07 — Nodes: usability and scale (resize handle, raise survives reload, phone opening, lag at scale)

Branch `fix/raw-usability-scale-2026-10-07`, built on `fix/raw-778-rework-2026-10-07` (PR #798). Source: the real-mouse walk, `~/di-backups/agent-wip-2026-10-07/reports/item5/bugs.md` (P2, P6, P9, P15, P3, P8). Findings and measurements: `~/di-backups/agent-wip-2026-10-07/reports/fix-g2-raw.md`.

- P9: a card's paint order is `graphZ` on the node (optional, absent = document order, `projectSchema` keeps it). The move op carries position and raise together (`updateNode` patch `{graphX, graphY, graphZ}`), so it is one op, one undo step, and `di follow` carries it like any move. Render sorts by `graphZ` (stable) in `cardOrder.js`.
- P2: the resize handle's hit area is 24 screen px (44 on `pointer: coarse`) at any zoom (`--raw-zoom` set on the canvas), capped at 45 % of the card; the visible mark stays 14 px and square.
