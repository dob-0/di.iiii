## 2026-11-26 — Light desk: a Camera page with a live 360 view

- The desk has a Camera page (tab beside Aim): any v4l2 camera named in `<data dir>/camera.json` (or picked in the page), shown live. 360 is a WebGL2 look-around of an equirectangular frame (drag, wheel, pinch, double-click to centre); Flat is the whole frame.
- Server side is `serverXR/src/lighting/camera.js` and three routes (`api/camera`, `api/camera/config`, `api/camera/frame`, in the contract as class c). The camera is opened by `ffmpeg -c:v copy` (its own MJPEG passed through, no decode or encode) only while frames are asked for, and released after 10 s idle. A camera another program holds is not taken: the page says it is in use.
- Tests: `node serverXR/src/lighting/tests/test-camera.js` (camera mocked, 8 checks); wiring, http and contract tests updated for the new page. Pictures were taken headless on a throwaway desk at 1536x864@1.667 and 390x844@3, one real grab from a 2880x1440 camera.
- Not done: no long-run CPU measurement on the real camera, no test while another program holds a real camera, wiki vitest not run (no install in this tree).
