## 2026-10-07 — Studio draws frames only when something changes

- Studio ran its render loop every frame even with nothing moving (StudioViewport `frameloop="always"`), which is constant GPU and CPU heat while Studio is open.
- It now uses react-three-fiber's on-demand loop (src/studio/utils/renderDemand.jsx). The loop runs only while a source holds it (a published viewer, a playing animation clip, a video, a strobe, clocked expressions, a bloom or haze scene, live screens, XR, a playing timeline preview) or for 1.5 s after an input or an edit. Sources that ease toward a goal (smart view, door labels, link plates, lens zoom, typewriter text) ask for the next frame with `invalidate()` until they arrive.
- Still continuous by design, owed: bloom and haze scenes (HdrBloom and the frame-rate governor draw every frame); each should declare itself so only a really moving haze holds the loop.
- Measurements and the real-surface walk: see the report named in the pull request.
