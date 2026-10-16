## 2026-10-15 — One loading ring at every wait

Branch `feat/loading-ring-everywhere-2026-10-15`, from dev (63eeb801). Owner, on a screenshot of the room page loading: "i like this
loading thing so we need to every loading shown, that no one thinks something is broken".

- The ring he liked is `src/components/LoadingScreen.jsx` (white arc on faint ring, black). Reused, no second ring.
- Added: `variant` (screen | cover | inline), one drawn line `text`, `waitingFor`, and after 8 s a second line "still waiting for …".
  Exported `LoadingRing`. The old "no drawn words" rule is replaced: words are opt-in, the ring alone stays the default for routes.
- Wired (were text-only or a one-off): room page document wait (was a red ring on grey), Studio project overlay, Studio hub and
  Space hub status, show page, cue lists, Studio projects panel, constellation, domain panel, code-space director, device login,
  admin/preferences lists, project switcher.
- Measured (scratch stack, lane 2, every /api call delayed): ring on screen at ~340–370 ms from navigation start on the room page
  (cold navigation, includes HTML + chunk; not the 100 ms of the brief); 8 s line seen at 10.5 s.
- Owed: see `~/work/agent-reports-2026-10-15/moxir-50/loading-everywhere-report.md` (surfaces not wired, /studio first seconds,
  texture/GLB/scene-switch/version-switch/Walk-start waits).
