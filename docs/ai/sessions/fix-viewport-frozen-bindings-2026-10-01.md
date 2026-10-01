## 2026-10-01 — dev's 3D rooms were black: the viewport crashed on frozen camera bindings

Owner: "check why dev.diiii.xyz/moxir is black do the deep audit fix everything". A first-time visitor on the GPU
(RTX 3080, fresh profile) got NO canvas on desktop or phone; console: `TypeError: Cannot assign to read only property
'left' of object` in StudioViewport. Not lighting, not files (every asset GET answers; a HEAD 403s, which is the edge,
not the app). Cause: a9b9a77a (Blender navigation) passed the frozen preset `mouseButtons`/`touches` to camera-controls,
which keeps the object; the ortho-swap effect and `useCameraNavigation` write into it → throw → viewport unmounted.
Every Studio 3D view on dev was affected, not only MOXIR. Prod (main) does not have a9b9a77a.

Fix: `controlBindingsFor()` (mappings.js) — fresh writable copies; StudioViewport memoises them per preset. Guard:
`mappings.test.js` "controlBindingsFor" (wiring case fails on the old viewport); `src/studio/navigation/` 37 tests pass.
Seen: this branch's app (vite on 127.0.0.1:5299, proxied to dev.diiii.xyz) at /moxir — desktop mean luma 11.9, phone
9.2, canvas drawn, 0 failed requests; frames `~/Downloads/moxir-dev-black/fixed-*.png`. Dev itself is black until this
lands and deploys.
