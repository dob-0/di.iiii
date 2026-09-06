## 2026-09-06 — the front door's view mode orbits, zooms and opens doors

- The complaint, verbatim: *"the view mode is useless when you click step inside after
  that when want to see view mode it useless just one frame nothing."* Reproduced on
  prod: after "Step inside", pressing "◐ View mode" gave a frame that answered nothing —
  a 300px drag changed zero pixels.
- The cause was one expression. `LandingPage.jsx` passed
  `interactive={entered && !viewMode}`, so view mode did not switch the room to another
  mode: it switched the room OFF. `GridFloorBackground` then set `pointer-events: none`
  and `LiveProjectScene` handed the camera to `PosedCamera` (the landing's own
  `cameraPoseRef`, pinned at `REST_POSE`) — hence one still frame, not even the
  decorative drift.
- View mode is now a MODE of the interactive room. `LiveProjectScene` takes an `orbit`
  prop; `interactive` stays true across the toggle and the pair (`walking`, `viewing`)
  decides which controller mounts. `walking` also gates the walker's own chrome — the
  mobile joystick, the Fly button, the F key, XR entry, the lock hints — so view mode no
  longer leaves controls on screen for a camera that cannot answer them.
- `ViewOrbit` mounts drei's `OrbitControls` in place of `<Walker>` inside the SAME
  Canvas. Chosen over rendering `PublicProjectSceneSurface`'s orbit surface
  (`StudioViewport`), which is a second renderer with a second Canvas: swapping to it
  would tear down the room's WebGL context, its loaded assets and the landing's own
  `sceneExtras` on every press of one button, and it does not draw portals as portals —
  the doors would stop being doors.
- No jump on the toggle. The pivot is taken from where the camera is already looking,
  at roughly the room's own depth (`clamp(distance to centre, 3, 90)` along the current
  forward axis) rather than snapped onto the room's centre.
- The calm drift runs as `autoRotate` and stops at the first drag. Pan is off, the polar
  angle stops just short of the floor, the dolly is capped at 3–90 units.
- Doors behave as they always did in the published viewer: hover shows the nameplate and
  the cursor turns to a pointer; a click (a tap on a phone) goes through. Walking through
  a door stays walk-mode-only — nobody is walking in view mode, and a proximity latch
  there would fire on a dolly.
- The hint under the buttons says what actually works: "Drag to orbit · Scroll to zoom ·
  Click a door" on a desktop, "Drag to orbit · Pinch to zoom · Tap a door" on a phone.
  The walk hint is unchanged, and it now renders in both modes instead of vanishing.
- "→ Walk / fly" returns to the walker exactly where it was standing — the walker's
  `playerRef` survives the toggle, which is what it did before this change too.
- Nothing else on the landing moved: the copy, the flight into the room, PageDebris,
  Back.

### Looked at, not assumed

Headless Chromium (swiftshader) against this branch on vite :5191, proxying the local
API. Screenshots read, not just captured. Desktop 1440×900 DPR1 and phone 390×844 DPR3
with real touch and pinch:

- desktop drag: **31.4%** of pixels differ (was 0.00% — two identical frames — on prod)
- desktop wheel zoom: **31.2%**; hover a door: the nameplate appears, `body.cursor`
  becomes `pointer`; clicking it navigated to `/beyond-form`
- phone touch drag: **46.8%**; phone pinch: **46.1%**; a tap on a door went to `/br_id_ge`
- back in walk mode: drag-look **8.5%**, W alone **19.1%** (measured against `dev`'s
  **20.3%** on the same move — the walker is untouched); phone joystick **8.3%**
- zero console errors on the landing in both viewports

### Guards

`npm run lint` 0 errors · `npm run test -- --run` green · `npm run build` green ·
`node scripts/check-agent-docs.mjs` green.

Two existing source-shape guards named the old expression and were updated to the new
one, keeping their intent: `liveProjectSceneSeams.test.js` (the joystick's guard is
`walking && isMobile`) and `walkThroughPortalWiring.test.jsx` (the walk-through is wired
to the Walker only), the latter gaining a case that view mode never grows a
walk-through of its own. New: `src/landing/landingViewMode.test.jsx` and
`src/components/GridFloorBackground.test.jsx`.

### Not done

`src/wiki/wikiContent.js` needed no change — it describes view mode on published pages
(clicking a ring, the nameplate on hover), and every sentence there is now true of the
front door too. Nothing in it described the front door's modes.
