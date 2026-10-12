// MEASUREMENT MODE — the lights that are not the rig, held at zero while it measures.
//
// The scene's fixtures are three.js SpotLights (and PointLights): they stay. Everything else
// that lights a surface is a viewing aid, not the night (RIG_BUILD §20.4, simulation-method
// §2.7): the work light (worldState.ambientLight, #a39c92 at 0.1 on MOXIR), the arrival
// directional light, any hemisphere light or light probe, and the scene's environment map
// (image-based light). The rig's bounce ambient (rigBounce.js, named RIG_BOUNCE_NAME) is an
// approximation of real inter-reflection: off by default so a probe reads DIRECT light only
// (simulation-method §3.3 T2), kept with &bounce=1.
//
// Held, not removed: each light's own intensity is remembered and put back when the mode
// ends; a value React writes while the mode is on is remembered the same way (the hold runs
// every frame), so leaving the mode always shows the scene as authored.

/** The name RigBodies gives the rig's bounce ambient (rigBounce.js), so it can be told apart. */
export const RIG_BOUNCE_NAME = 'rig-bounce'

/** Is this object a light that is not a fixture? */
export const isViewingAid = (o, { keepBounce = false } = {}) => {
    if (!o?.isLight) return false
    if (keepBounce && o.name === RIG_BOUNCE_NAME) return false
    return Boolean(o.isAmbientLight || o.isHemisphereLight || o.isDirectionalLight || o.isLightProbe)
}

const kindOf = (o) => (o.isAmbientLight ? 'ambient' : o.isHemisphereLight ? 'hemisphere' : o.isDirectionalLight ? 'directional' : o.isLightProbe ? 'light probe' : o.type)
const hex = (c) => (c?.getHexString ? `#${c.getHexString()}` : null)

/**
 * Hold every viewing aid in `scene` at zero. `saved` (a Map) keeps what to put back.
 * Returns what is held, for the report: [{ kind, name, colour, intensity }].
 */
export const holdViewingAids = (scene, saved, { keepBounce = false } = {}) => {
    if (!scene) return []
    scene.traverse((o) => {
        if (!isViewingAid(o, { keepBounce })) return
        if (o.intensity !== 0) {
            saved.set(o, o.intensity)
            o.intensity = 0
        }
    })
    if (scene.environment) {
        saved.set(scene, scene.environment)
        scene.environment = null
    }
    const held = []
    for (const [o, value] of saved) {
        if (o === scene) held.push({ kind: 'environment map', name: value?.name || null, colour: null, intensity: null })
        else held.push({ kind: kindOf(o), name: o.name === RIG_BOUNCE_NAME ? 'rig bounce (rigBounce.js)' : o.name || null, colour: hex(o.color), intensity: value })
    }
    return held
}

/** Put every held light (and the environment) back as it was. */
export const releaseViewingAids = (scene, saved) => {
    for (const [o, value] of saved) {
        if (o === scene) {
            if (scene && !scene.environment) scene.environment = value
        } else if (o.intensity === 0) {
            o.intensity = value
        }
    }
    saved.clear()
}
