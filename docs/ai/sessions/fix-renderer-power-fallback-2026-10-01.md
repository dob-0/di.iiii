## 2026-10-01 — a canvas that asks for 'high-performance' must not go black when the browser refuses it

Found in the dev.diiii.xyz black-room audit (owner: "do the deep audit fix everything"). In the owner's Flatpak
Chromium, moved to the RTX 3080 that night (di-atlas #17: ANGLE on Vulkan + PRIME offload), a WebGL2 context is
granted for powerPreference 'default' and 'low-power' and REFUSED (null) for 'high-performance' — with or without the
offload variables. R3F defaults to 'high-performance', three.js throws on null: the front room, SceneCanvas,
LiveProjectScene and the Raw viewport drew nothing; StudioViewport ('default'/'low-power') was unaffected.

Fix: `rendererWithFallback()` (`src/project/viewport/rendererFallback.js`) — R3F's own renderer defaults, one retry with
'default'. Used as the `gl` prop of SceneCanvas, LiveProjectScene, RawViewport. Guard `rendererFallback.test.js` (3).
Seen in the owner's configured browser against this code: `/` and `/moxir` draw a canvas; dev without it draws none.
Open: three adds its context-lost listeners before getContext, so a retried canvas holds them twice (harmless).
