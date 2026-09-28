// The viewer's look settings, as the Walker's movement loop reads them.
//
// STUB for integration (2026-09-28): the look-input lane (branch working in
// ~/work/di.iiii-look) owns the real settings — `getLookSettings()` returning at
// least `{ bob, fov }`. When it lands, replace this body with a re-export of
// that getter; the movement loop only reads `.bob` (0/false = off, 1/true =
// full BOB_AMPLITUDE, between = scaled). Default here: bob OFF.
export const DEFAULT_LOOK_SETTINGS = Object.freeze({ bob: 0 })

export function getLookSettings() {
    return DEFAULT_LOOK_SETTINGS
}
