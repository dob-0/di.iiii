// Per-object idle motion, shared by the live viewer (LiveProjectScene) and the
// portal-embed pipeline so an object animates the same inline as standalone.
//
// Authored `components.animation.mode` wins. With nothing authored we fall back
// to the legacy name conventions + sensible defaults (models float, flat media
// sways) so existing content keeps the look it had before animation was data.

// Deterministic per-entity phase offset so idle motion isn't synchronized.
// Shared, because the arrival view (StudioViewport) and walk mode
// (LiveProjectScene) animate the same room one click apart: a second seed
// would restart every object's motion at the click.
export function animationSeed(entityId) {
    const id = String(entityId || '')
    let hash = 0
    for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) % 1000
    return (hash / 1000) * Math.PI * 2
}

// The AUTHORED animation only, or null — no fallback, ever.
//
// The arrival view (StudioViewport in orbit) uses this rather than
// `resolveAnimation` below. The fallback exists so that scenes imported before
// animation was data keep the drift they were built with, and it has run in
// walk mode for as long as walk mode has existed. Reaching it from the arrival
// frame would be a different thing entirely: it would set WCC's sculpture, the
// Dilijan camp room and every other live room drifting on the first frame a
// stranger sees, without any of their authors having asked for motion. So
// arrival shows motion someone chose, and nothing else.
export function authoredAnimation(entity) {
    const anim = entity?.components?.animation
    if (!anim?.mode || anim.mode === 'static') return null
    return { mode: anim.mode, speed: anim.speed ?? 1, amplitude: anim.amplitude ?? 1 }
}

export function resolveAnimation(entity) {
    const anim = entity?.components?.animation
    if (anim?.mode) {
        return { mode: anim.mode, speed: anim.speed ?? 1, amplitude: anim.amplitude ?? 1 }
    }
    // A parented entity is PART of something, not an object standing in a room:
    // the fallback is per-entity with its own phase seed, so letting it apply
    // inside a group dismembers the group -- a TV's cabinet spinning one way
    // while its picture rocks the other. Authored `animation.mode` still wins,
    // so a child that is meant to move on its own can still say so.
    if (entity?.parentId) return { mode: 'static', speed: 1, amplitude: 1 }
    const name = entity?.name || ''
    if (/ground|floor|gate|threshold|entrance/i.test(name)) return { mode: 'static', speed: 1, amplitude: 1 }
    if (/\bfly\b/i.test(name)) return { mode: 'orbit', speed: 1, amplitude: 1 }
    const isFlat = entity?.type === 'image' || entity?.type === 'video'
    return { mode: isFlat ? 'sway' : 'float', speed: 1, amplitude: 1 }
}

// Mutate `group` for the current (already seed-offset) time `t` from the authored base.
export function applyAnimation(group, anim, basePos, baseRot, t) {
    const amp = anim.amplitude ?? 1
    const ts = t * (anim.speed ?? 1)
    switch (anim.mode) {
    case 'bob':
        group.position.set(basePos[0], basePos[1] + Math.sin(ts * 0.7) * 0.12 * amp, basePos[2])
        group.rotation.set(baseRot[0], baseRot[1], baseRot[2])
        return
    case 'spin':
        group.position.set(basePos[0], basePos[1], basePos[2])
        group.rotation.set(baseRot[0], baseRot[1] + ts * 0.12, baseRot[2])
        return
    case 'float':
        group.position.set(basePos[0], basePos[1] + Math.sin(ts * 0.7) * 0.12 * amp, basePos[2])
        group.rotation.set(baseRot[0], baseRot[1] + ts * 0.12, baseRot[2])
        return
    case 'sway':
        group.position.set(basePos[0], basePos[1] + Math.sin(ts * 0.7) * 0.08 * amp, basePos[2])
        group.rotation.set(baseRot[0], baseRot[1] + Math.sin(ts * 0.4) * 0.08, baseRot[2])
        return
    case 'orbit': {
        const r = 1.6 * amp
        group.position.set(
            basePos[0] + Math.cos(ts * 0.6) * r,
            basePos[1] + Math.sin(ts * 1.3) * 0.5 * amp,
            basePos[2] + Math.sin(ts * 0.6) * r
        )
        group.rotation.set(baseRot[0], ts * 0.6, baseRot[2])
        return
    }
    case 'static':
    default:
        group.position.set(basePos[0], basePos[1], basePos[2])
        group.rotation.set(baseRot[0], baseRot[1], baseRot[2])
    }
}
