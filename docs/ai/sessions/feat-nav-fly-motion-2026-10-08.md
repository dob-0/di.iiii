## 2026-10-08 — pure fly motion for the viewer

- Done: `src/project/viewport/flyMotion.js` (`flyStep`, `FLY_DEFAULTS`, `speedForScene`, `flyStart`, `forwardFromYawPitch`), 12 vitest tests (frame-rate independence, dt 0/NaN/huge, smooth stop, sprint, wheel clamp, normalised diagonals), eslint clean, spec section in `docs/ai/navigation-spec.md`.
- Sources fetched: Blender 5.2 walk_fly, Unreal viewport controls, Unity SceneViewNavigation (URLs in the spec). They publish no numbers: all defaults are ours, marked unvalidated.
- NOT done: not wired into StudioViewport / SmartView, not seen in a browser, not flown by the owner; no Alt-slow modifier, no collision; the existing Walker (walkModeConfig.js) is untouched.
