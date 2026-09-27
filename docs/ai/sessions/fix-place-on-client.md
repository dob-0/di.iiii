## 2026-09-28 — a photo lands in its wall slot at once

- In a build-zone room the editor now places its own batch with the server's twin (src/shared/placement.js)
  before showing or sending it, so nothing stands at the drop point and then jumps. All editors, one hook.
- Measured under 300ms latency: slot from the first frame (old: drop point, then the jump). Screen = server.
- Third fix from the 2026-09-28 re-check. "Keep Current World" (V1 editor only) was left for decision 1.
