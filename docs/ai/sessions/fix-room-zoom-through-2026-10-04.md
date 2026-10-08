## 2026-10-04 — the zoom never stops: the wheel dollies through instead of dying at the minimum distance

- Owner: "i still can't fully zoom". Cause: camera-controls stops at `minDistance` and nothing moved the target — 2 m under a room's Inside lock (SmartView), 0.35 m in Studio.
- Fix: `infinityDolly` on the viewport's `<CameraControls>`; at the minimum distance the wheel carries the target forward with the camera, and SmartView's boundary still keeps the target in the hall.
- Measured in a real browser (RTX 5060, `/moxir?quality=full`, camera read from the shaders' `cameraPosition`): before, 15 m in 6 wheel steps then 0 m for 34; after, 0.75 m on every one of the 40 steps, ending inside the hall past the stage.
- Guard: `src/studio/components/studioZoom.test.js` (red without the prop); known-fixes row; wiki line on the smart-view entry.
- Not checked: pinch-zoom on a real phone (same controls, same prop — expected to behave the same).
