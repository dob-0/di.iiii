## 2026-10-03 — no WebGL says so on the 3D view instead of taking the page down

- Owner's installed `.14` showed a blank page on `/hayfilm/studio` and a black `/moxir/studio`: "Error creating WebGL context with your selected attributes", uncaught. Measured in his Flatpak Chromium (ANGLE/Vulkan, RTX 3080), throwaway profile: webgl2 for powerPreference default yes · low-power yes · high-performance NO. `.14` predates #714's retry.
- The two works (algoVrithm, the WCC landing's ProcessField) still asked R3F's default 'high-performance' with no retry — they now use `rendererWithFallback()`.
- `WebglUnavailableBoundary` (in `src/components/WebglContextGuard.jsx`) wraps every `<Canvas>`: when even the retry gets no context, the 3D view says "No 3D view: this browser gave no WebGL context", the reason and Try again; the rest of the page stays; any other error passes on. The context-lost button is a 2 px rectangle now.
- Seen in his browser configuration: this branch logs the retry and draws `/hayfilm/studio`; `.14` blank with the error. Tests: components/studio/RawViewport/works 190 files, 1695 passed, + 4 new boundary tests.
- Owner's install: `0.4.16-rigbuilder.15` = `.14` + #714 + this, installed with `preview-install.sh --step 15` (branch `preview/rigbuilder-15-2026-10-03`).
- Still undone: three.js prints two red console lines before the retry succeeds (harmless; a probe before creating the renderer would avoid them). The "No 3D view" panel itself has not been seen in a real browser with WebGL switched off — only in jsdom.
