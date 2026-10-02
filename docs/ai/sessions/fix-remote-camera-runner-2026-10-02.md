## 2026-10-02 — a camera on another machine reaches the page that asks

- The owner's report: "can't see the asus camera in my raw". Reproduced headless before
  any change: Raw opened from asuz's address (`http://100.72.53.77:4000/test-desk/raw/projects/test`)
  had `isSecureContext: false`, no `navigator.mediaDevices`, and the Camera In card stayed
  black with no word. asuz's only browser (the projector kiosk) showed project `wall`, so
  no page on asuz ever opened project `test`'s camera.
- Four fixes, one branch (`docs/ai/known-fixes.md`, the row "A Camera In set to run on asuz
  stayed black"): the camera's refusal is said on the card and inside the node
  (`cameraRefusal`); a tab's hello carries `projects` + `capture` and `runnerOn` asks a page
  that runs the project and can open a camera; a page whose browser is on another computer
  is AWAY (`serverXR/src/machines/onThisMachine.js`) and never acts as that machine; in dev
  the socket goes through the Vite proxy (page origin), not straight to :4000.
- Seen, not only tested: with asuz's kiosk switched to `test-desk/map/test/out` (by its
  debug port, for the session only — its saved address still says `wall`), a viewer on an
  aylmo install received asuz's webcam picture over WebRTC (ICE connected, 181 previews in
  30 s) and the owner saw it in his Chromium. The insecure page now shows the reason on
  the Camera In card (screenshot taken at DPR 2). Own-machine pages through loopback and
  through aylmo's own tailnet address answer `away: false` on a live server.
- Not seen: `away: true` from a real second computer (no second browser on another host
  was available); covered by `routes.test.js` and `onThisMachine.test.js`. asuz runs
  0.4.16 and drops the new hello fields until it is updated — the viewer then falls back
  to the old choice, which the live check above exercised.
- Hosted tiers: every page there is AWAY (no browser runs on the server), so an operator
  set to run on the hosted server's machine runs nowhere — before, every visitor's browser
  claimed to be that machine.
