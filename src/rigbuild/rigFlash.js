// STROBES AND BLINDERS AS A FLASH — the arithmetic, pure (RigFlashes.jsx draws it).
// docs/architecture/RIG_BUILD.md §15.6.

import { spotAimDirection } from '../project/viewport/spotLightAim.js'

// Per kind: the face (w × h, metres — the Atomic 3000's lens field is about 0.40 × 0.16
// m, a 4-lite blinder's about 0.45 × 0.45), the glare sprite's size, the colour, and the
// one shared light that puts the flash on the surfaces in front. Intensities are
// three.js candela in this room's scale, set by eye on the RTX 3080 against the rig's
// own real lamps (2026-09-28); a planning figure, like the strobe's 60° (ASSUMED).
export const FLASH = {
    strobe: { face: [0.40, 0.16], glare: 3.2, glareOpacity: 0.95, colour: '#f4f7ff', lightIntensity: 2600, lightDistance: 45, lightAngle: 0.62 },
    blinder: { face: [0.45, 0.45], glare: 1.8, glareOpacity: 0.55, colour: '#ffb46a', lightIntensity: 260, lightDistance: 30, lightAngle: 0.55 }
}

// The strobe rate and the flash's length. A xenon or LED strobe fires a pulse of a few
// milliseconds; on a 60 Hz screen that is one bright frame and a tail. 10 flashes a
// second, each decaying with a 22 ms time constant: at 60 fps a flash is ~2 frames, at
// 30 fps one — short and sharp, dark between.
export const STROBE_HZ = 10
export const FLASH_TAU_S = 0.022

/**
 * The strobe's brightness at time t (seconds), 0..1, at `hz` flashes a second (the desk's
 * flash rate when a desk drives the lamp, RIG_BUILD.md §19.3; else the look's 10 Hz).
 */
export const strobeEnvelope = (t, hz = STROBE_HZ) => {
    const rate = Number(hz) > 0 ? Math.min(60, Number(hz)) : STROBE_HZ
    const period = 1 / rate
    const phase = ((Number(t) || 0) % period + period) % period
    return Math.exp(-phase / FLASH_TAU_S)
}

/** The lamps the room draws as a flash: id, kind, level (0 = out in this look), lens, aim. */
export const flashLamps = (entities = []) => entities
    .filter((e) => e?.type === 'spotLight' && e.components?.rigFlash && e.components?.runtime?.visible !== false)
    .map((e) => ({
        id: e.id,
        kind: e.components.rigFlash.kind,
        level: Math.max(0, Math.min(1, Number(e.components.rigFlash.level) || 0)),
        // Set only when a desk drives the lamp (dmxPose.js): its own rate, or steady.
        hz: Number(e.components.rigFlash.hz) > 0 ? Number(e.components.rigFlash.hz) : 0,
        steady: e.components.rigFlash.steady === true,
        lens: (e.components.transform?.position || [0, 0, 0]).map(Number),
        dir: spotAimDirection(e.components.transform?.rotation)
    }))

/** One shared light for a set of lit lamps of a kind: at their centre, along their mean aim. */
export const flashRig = (lamps = []) => {
    if (!lamps.length) return null
    const n = lamps.length
    const lens = [0, 1, 2].map((k) => lamps.reduce((s, l) => s + l.lens[k], 0) / n)
    const sum = [0, 1, 2].map((k) => lamps.reduce((s, l) => s + l.dir[k], 0))
    const len = Math.hypot(...sum) || 1
    return { lens, dir: sum.map((v) => v / len), level: lamps.reduce((s, l) => s + l.level, 0) / n }
}
