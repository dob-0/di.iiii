## 2026-08-23 — the crossing from Studio to Nodes landed on a screen that said the work was gone

- Owner's report: "landing page still the same and actually nothing is wired — Studio and Raw
  is connected?" Two separate things, and only one of them was a bug.
- **Not a bug:** the landing. The one-door landing shipped 2026-08-21 and is on dev and
  staging; production still serves the retired three-door version because nothing has been
  promoted. The owner's own dev server was also 31 commits behind `origin/dev` with a peer
  agent's uncommitted `LandingPage.jsx` rewrite in the tree, so it showed a third variant that
  exists nowhere else. Verified from a clean worktree on a second port rather than pulling
  under the peer.
- **Not a bug either:** Studio→Raw exists. `⇄ Nodes` sits in the control cluster's Display
  section (`StudioControlCluster.jsx`), with a mobile twin in the phone topbar, and it
  navigates to the right project.
- **The bug:** what it arrived at. A project authored in Studio holds entities and no nodes,
  so Raw's graph is genuinely empty — and the empty-graph sentence, "Double-click to place
  your first node", is written for a project with nothing in it. Crossing over therefore read
  as "the other editor threw my work away", when `RawViewport` had been rendering those same
  entities at root scope the whole time.
- Fixed by saying the true thing and offering the way to it: "Built in Studio — N objects in
  the room, no nodes yet", plus a `See the room` button that opens the scene fullscreen.
  `Build an example` is now suppressed whenever entities exist — it injects six nodes, and
  offering that as the primary action on somebody's project invites them to bury it.
- The sentence became a pure helper (`src/raw/utils/emptyCanvasHint.js`) because a server
  project's document arrives through sync, which every test in `RawEditor.test.jsx` mocks —
  in place it was unreachable from a test.
- Verified by looking, on the local build: Studio `mini` → `⇄ Nodes` → the new sentence →
  `See the room` → the project's video object standing on its floor, with `‹ graph` back.
  Desktop 1440×900 and iPhone 13 (button 129×44, no horizontal scroll).

### Still open, deliberately

- **Jam mode hides every lane door.** In a jam project `minimal` suppresses `← Projects`,
  `⇄ Nodes` and `↗ View live` alike. `/open/studio` redirects to `open-jam`, so the first
  Studio a visitor sees is the one variant with no way anywhere. Left alone: whether a jam
  kiosk should offer the crossing is the owner's call, not a defect to patch quietly.
- **Both doors are buried.** Studio's `⇄ Nodes` lives under "Display", next to Fullscreen and
  Hide UI; Raw's "Open in Studio" lives in the ⋯ overflow. Switching editors is not a display
  setting. Moving them is a UI decision, not a fix.
- **Production is still behind everything** — this, and the 2026-08-21 doors-audit wave.
