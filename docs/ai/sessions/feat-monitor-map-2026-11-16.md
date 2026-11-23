## 2026-11-16 — Monitor: tiers overview strip, map view, workspace view, live stream (frontend)

- Part 2 of the owner's private overview. Inside the existing Monitor admin section: an overview strip (prod, dev, each local tier: commit, age, behind dev, health, spaces; drift in the warning colour), a Map tab (plain SVG, layered by kind, node click opens the Inspector, grouped list at phone width) and a Workspace tab (open asks newest first, agent lanes, machine reports, one "send an ask" box with an optimistic row).
- The page subscribes to GET /api/monitor/stream (event `snapshot`) and falls back to the 5 s poll when the stream is missing or breaks. New in apiClient: `monitorStreamUrl`, `postMonitorAsk`.
- Built against fixtures that follow SPEC-di-overview.md's contract; the backend (Part 1) is a separate branch, so on the scratch API the new blocks show their empty states until it lands.
- Fixed while testing: a poll started by the stream coming on could overwrite a newer snapshot; the initial read is now separate from the polling interval.
