# Walk and fly keys — the spec table

One place for the keys of di.iiii's walk and fly (the public viewer, Studio's Walk, /build). Code: `src/components/walkKeys.js`,
`src/components/physicalKey.js`, `src/components/headLight.js`; Studio's own shortcuts: `docs/ai/shortcuts.md`.

**Rule (owner, 2026-10-28, ledger N1443/N1445):** where the main tools agree on a key, di.iiii takes it. Where each has its own, di.iiii
keeps its key. **Keys are physical (2026-10-29):** the walk reads `event.code` (`KeyW`, `KeyE`, `Space` …), so an Armenian or Russian
layout walks exactly as a Latin one; a synthetic event with no `code` falls back to `event.key`. Typing into a field never moves the camera.

Sources read 2026-10-29 (fetched that day): Unity <https://docs.unity3d.com/Manual/SceneViewNavigation.html> · Unreal
<https://dev.epicgames.com/documentation/en-us/unreal-engine/viewport-controls-in-unreal-engine> · Roblox Studio
<https://create.roblox.com/docs/studio/ui-overview> · Blender <https://docs.blender.org/manual/en/latest/editors/3dview/navigate/walk_fly.html> ·
Minecraft <https://minecraft.wiki/w/Controls>.
Unity's own source for the direction (fetched 2026-10-29): <https://github.com/Unity-Technologies/UnityCsReference/blob/master/Editor/Mono/SceneView/SceneViewMotion.cs> lines 277 and 281 -- `ClutchShortcut("3D Viewport/Fly Mode Up", typeof(CameraFlyModeContext), KeyCode.E)` and `"Fly Mode Down" … KeyCode.Q`. The manual page says only "press Q or E".

**A choice, not a loss (owner, 2026-10-29):** the old pair (Q up, E down, from 2026-06-20) is a setting beside "Mouse in Edit": "Fly up and down" in Scene -> Move and in the public viewer's Move card (`src/studio/navigation/flyKeys.js`). E up / Q down is the default (N1445.1). **Shortcuts with Ctrl / Cmd follow the letter** (`event.key`); only movement and the walk's action keys follow the place.

| Action | di.iiii | Unity | Unreal | Roblox Studio | Blender | Minecraft | Rule applied |
|---|---|---|---|---|---|---|---|
| Move forward / left / back / right | W A S D (+ arrows) | W A S D | RMB + W A S D | W A S D | W A S D | W A S D | agree — taken (was already) |
| Fly up | **E**, Space | E (source below) | RMB + E | E | E (gravity off) | Space (hold, Fly Mode) | E agreed by Unity, Unreal, Roblox, Blender; Space kept |
| Fly down | **Q**, C | Q (source below) | RMB + Q | Q | Q (gravity off) | not read | Q agreed by Unity, Unreal, Roblox, Blender; C kept |
| Fly on / off | F | none (RMB held) | none (RMB held) | none (RMB held) | Tab (gravity) | double-tap Space | differ — ours kept (F) |
| Head light | L | none found | none found | none found | none found | none found | no standard — ours kept (L) |
| Frame / focus selected (Studio edit, not the walk) | F (Studio) | F | F | F | numpad . | — | agree — Studio's F; in the walk F is Fly |

Studio's Walk (`src/studio/navigation/useWalkNavigation.js`) already read `event.code` with E up / Q down (Blender's walk) before this.
Archive: the pair before 2026-10-29 (Q up, E down) is `LEGACY_ALTITUDE_KEYS` in `walkKeys.js`; a caller can pass it as `altitudeKeys`.
**Clash kept as it was:** in /build, Q raises the piece and E opens the inventory (RIG_BUILD.md §13); its fly keys stay Space / C.
