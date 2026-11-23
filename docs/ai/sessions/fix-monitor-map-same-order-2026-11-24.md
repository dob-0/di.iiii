## Monitor: the map is drawn the same on every machine (2026-11-24)

Owner 11-24: "why still in aylmo the agent map is different than here i told that i need to all".
Measured: same 71 node ids on both, but order viewer-first, self line "runs" vs "reports", own spaces panel failing (404 / fetch failed).
Fix: sorted nodes, lines and tiers; one line kind; spaces panel reporter-only at the API address.
Tests: 412 passed (monitorHub, monitorStore, monitorReport, monitorAccount, preferences).
