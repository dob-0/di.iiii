// HEAD LIGHT — a flashlight that follows the visitor's view in walk mode.
//
// A part, not a show feature: any project can turn it on, none gets it by
// default. The field lives where walk settings already live, in the project
// document's `worldState` (like `spawn`, `fog`, `walkableAreas`):
//
//     worldState.headLight = { enabled: true }      // absent / null = no head light
//
// With the field present the visitor gets a toggle: the F key on a PC, a square
// button on a phone. The light starts OFF either way, and `on` is the visitor's
// own state, never saved into the document. (F is also Fly's key; in a project
// with a head light, Fly moves to G and keeps its button. Elsewhere nothing moves.)
//
// Physics first (owner, 2026-10-13). The light sits exactly at the visitor's eye
// and points where the eye points, so every surface the visitor can see, the
// light can see too: the shadow test and the depth test are the same test, and
// a wall can never hide a lit thing from this viewer. What the light does behind
// a wall is only visible from a viewpoint that is not the walker's. Two paths:
//   - shadows allowed (High quality, or any project that leaves `shadows` on):
//     the light casts a shadow, so it also stops at walls for any other view;
//   - Low quality (phones: no shadow maps): no shadow. It shines on surfaces behind
//     a wall that nobody can see. Measured, limits: docs/ai/sessions/feat-head-light.md.
// A "stop the reach at the first wall" clamp was built first and thrown away: it
// dimmed the wall being looked at (three.js windows the light to zero at its
// range) and cost a ray against every mesh several times a second, to change
// nothing the visitor can see. Numbers in the session note.

export const HEAD_LIGHT_KEY = 'f'
// Projects that turn the head light on give F to it; Fly keeps its on-screen
// button and moves to this key.
export const FLY_KEY_WITH_HEAD_LIGHT = 'g'

// Full cone ~35 degrees (three.js `angle` is the half-angle), range ~10 m, inverse-square decay.
export const HEAD_LIGHT = Object.freeze({
    coneDeg: 35,
    penumbra: 0.45,
    range: 10,
    decay: 2,
    color: '#ffe6bd', // warm white
    intensity: 60, // candela, enough to read a dark wall at a few metres
    shadowMapSize: 1024,
    // A wall closer than this to the eye would be clipped out of the shadow map and let the light through.
    shadowNear: 0.05
})

/** @returns {{ available: boolean }} what the project document asks for. */
export const resolveHeadLight = (worldState) => {
    const field = worldState && typeof worldState === 'object' ? worldState.headLight : null
    return { available: Boolean(field && typeof field === 'object' && field.enabled === true) }
}

/** The F key (not while typing, not with a modifier, not on key repeat). */
export const isHeadLightKey = (event, isTyping = false) => {
    if (!event || isTyping || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return false
    return typeof event.key === 'string' && event.key.toLowerCase() === HEAD_LIGHT_KEY
}

/** Toggle reducer: off unless the project makes it available. */
export const toggleHeadLight = (on, available) => (available ? !on : false)

/**
 * Does the head light cast a shadow? Whenever the renderer allows shadows: High
 * quality, and any project that did not switch `renderSettings.shadows` off.
 * Low quality (`outputRenderSettings`) turns it off, so phones skip the shadow pass.
 */
export const headLightCastsShadow = (renderSettings) => !(renderSettings && renderSettings.shadows === false)
