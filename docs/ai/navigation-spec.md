# Navigation spec (draft 2026-10-08)

## Fly motion

Code: `src/project/viewport/flyMotion.js` (pure, tested in `flyMotion.test.js`). Wired into the Studio viewport by `src/studio/navigation/useFlyNavigation.js` (input and camera; tested in `useFlyNavigation.test.js`).

Method, sources actually fetched 2026-10-08. None gives a numeric default, so every number is ours and unvalidated until flown on a real scene.
- Blender 5.2 manual, Fly/Walk Navigation: https://docs.blender.org/manual/en/latest/editors/3dview/navigate/walk_fly.html (W/A/S/D, E/Q global up/down, wheel = speed, Shift faster, Alt slower).
- Unreal Engine viewport controls: https://dev.epicgames.com/documentation/en-us/unreal-engine/viewport-controls-in-unreal-engine (RMB + W/A/S/D, E/Q up/down, wheel = camera speed). The page does not mention Shift for fly.
- Unity Scene view navigation: https://docs.unity3d.com/Manual/SceneViewNavigation.html (flythrough, Shift faster, wheel = speed).
- The ramp is a first-order lag solved in closed form (`v = w + (v0 - w) e^(-dt/tau)`, exact position integral): ours, standard control practice, chosen for frame-rate independence and no overshoot.

| Parameter | Default | Meaning | Source |
|---|---|---|---|
| baseSpeed | 6 m/s | cruise speed at wheel 0; replaced per scene by speedForScene | ours, unvalidated |
| crossSeconds | 8 s | speedForScene = 2 x radius / 8, clamped 0.5..200 m/s | ours, unvalidated |
| accelTime | 0.15 s | time constant while a key is held | ours, unvalidated |
| stopTime | 0.12 s | time constant on release (roll-out about speed x 0.12) | ours, unvalidated |
| sprintFactor | 3 | Shift multiplier | held-faster modifier: Blender, Unity; factor ours, unvalidated |
| wheelStep | 1.25 | speed x 1.25 per notch up, / 1.25 down | wheel changes speed: all three; factor ours, unvalidated |
| minSpeedFactor / maxSpeedFactor | 0.01 / 100 | speed range as a fraction of baseSpeed | ours, unvalidated |
| verticalFactor | 1 | Q/E speed relative to W/S | Unreal, Unity move at camera speed; ours, unvalidated |
| maxDt | 0.1 s | longest frame counted | ours |
| restSpeed | 0.001 m/s | below this, with no key, velocity is set to 0 | ours |

Behaviour: you fly where you look (full pitch), A/D strafe flat, Q/E along world up; combined keys are normalised so a diagonal is not faster; dt <= 0 or not a number leaves the camera still.
Measured (vitest): 1 s of flight at 30 fps vs 144 fps agrees within 1 %; speed only falls on release and never reverses.
Owed: collision (fly passes through walls until the Inside box clamp), a right-button look-around (Unreal), flying a real scene to tune the numbers, a check of `frameloop='demand'` (lowPower) on a real run.

### Wiring rules (as coded, 2026-10-08 batch A)
- **Right button required.** Keys count only while the right button is held on the viewport; otherwise W/A/S/D/E/Q are Studio's own shortcuts. The latch is cleared by pointerup/cancel, window blur, hidden tab, a pointermove whose `buttons` has no bit 2, and a contextmenu that nobody prevented (camera-controls prevents it when the right button is mapped, which is the Studio case, and on Linux/macOS contextmenu fires on mousedown, so clearing on a prevented one would end every flight).
- **Chords are not fly keys.** A key with Ctrl or Cmd held is ignored (Ctrl+W, Cmd+Q stay the browser's).
- **Modifiers** come from `event.shiftKey` / `altKey` on every key, pointer and wheel event, so Shift or Alt pressed before the right button counts. Shift = speed factor (3), Alt = slow factor 0.25 (Blender); Shift wins.
- **Wheel = speed, per notch.** Wheel deltaY is normalised (deltaMode: lines x16, pages x100 px) and 100 px = one notch; speed x 1.25^notches, fractional notches allowed, so a trackpad swipe is a few notches, not dozens. The listener is on window (capture) with `stopImmediatePropagation`, so `useCameraNavigation`'s wheel handler does not also run.
- **speedKept rule.** The cruise speed outlives a flight (Blender, Unreal, Unity keep the wheel-set speed). When the Fly Speed slider (`speedScale`) changes, the kept speed is dropped and the next flight starts from the new base.
- **Camera end.** When a flight comes to rest (or the button is let go) the hook dispatches `controlend` on the controls, so `onControlEnd` saves the view as it does after a drag.
- **dt** is clamped to 0.1 s (flyMotion `maxDt`).

### Other surfaces changed in the same batch
- **Walk** (`LiveProjectScene.jsx`): forward and strafe ramps are clamped as a vector to the walk max speed (W+D was 1.41x; `navMath.stepWalkVelocity`); frame dt clamped to 0.1 s; held keys cleared on window blur and when the tab is hidden. E/Q meaning in walk is unchanged (owner decision owed).
- **Studio FOV easing** (`StudioViewport.jsx`): `1 - exp(-dt/0.12)` with dt clamped to 0.05 s, snap below 0.01 deg (was 0.08 per frame, frame-rate dependent).
- **Published showreel `AutoLookAround`**: surrenders permanently on any window keydown, wheel or pointerdown as well as camera-controls `controlstart`, because view keys, fly and the view cube use `setLookAt`, which emits no `controlstart`.
- Pure helpers: `src/project/viewport/navMath.js` (`clampDt`, `damp`, `dampLambda`, `normalizeWheel`, `wheelNotches`, `stepWalkVelocity`), tested in `navMath.test.js`.

Further sources: Blender `view3d_navigate*.cc` (view3d_walk / fly operators, speed wheel handling), camera-controls (`camera-controls.module.js`, contextmenu handling at the onContextMenu handler), and the audit `agent-reports-2026-10-08/nav-audit-our-code.md`.
