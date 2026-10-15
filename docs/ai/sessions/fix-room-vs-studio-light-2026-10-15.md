# fix/room-vs-studio-light-2026-10-15 — the room page dark where the Studio was lit

Brief: moxir-50/briefs/room-vs-studio-light.md (owner 14:07, two screenshots of moxir-v2-11). Report: moxir-50/room-vs-studio-report.md.

- Cause (measured): v2-11 holds one VJ Deck node; the public page drew any document with nodes through RawViewport,
  which has no room pipeline (no HDR, exposure, haze, bloom, render plan). Not exposure, not tone mapping, not renderPlan,
  not the light pool: the room page never mounted RenderSettingsEffect at all.
- Fix: `src/project/components/graphRoom.js` (graph surface only for a graph that draws in the room), used by
  PublicProjectSceneSurface and the viewer's Fly gate. Guard graphRoom.test.js.
- Numbers (1280x720, RTX 3080, same look held, Studio's camera handed to the room): Second drop room 10.5 → 65.2 (Studio 69.1);
  Drop away (DJ) 3.7 → 14.5 (Studio 15.4). Sheet ~/Downloads/moxir/v2-11/room-vs-studio.html.
- Tools: scripts/measure/room-vs-studio-shots.cjs (live values through window.__diRoom), picture-light.py, room-vs-studio-sheet.py.
- Not done: the owner's "a bit lighter" — the measurement shows room = Studio, nothing measured says 0.3 EV; not tuned.
  Phone look not taken (phones get Low, now through StudioViewport too). Bloom's glow read OFF on both sides on the agent
  screen (the quality governor stepped it off); the same on both, not this bug.
