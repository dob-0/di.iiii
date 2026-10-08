# Navigation spec (draft 2026-10-08)

## Fly motion

Code: `src/project/viewport/flyMotion.js` (pure, tested in `flyMotion.test.js`). Not wired into any viewer yet.

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
Owed: wiring, Alt slow modifier (Blender), collision, flying a real scene to tune the numbers.
