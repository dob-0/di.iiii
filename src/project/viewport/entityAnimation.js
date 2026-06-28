// Per-object idle motion, shared by the live viewer (LiveProjectScene) and the
// portal-embed pipeline so an object animates the same inline as standalone.
//
// Authored `components.animation.mode` wins. With nothing authored we fall back
// to the legacy name conventions + sensible defaults (models float, flat media
// sways) so existing content keeps the look it had before animation was data.

export function resolveAnimation(entity) {
    const anim = entity?.components?.animation
    if (anim?.mode) {
        return { mode: anim.mode, speed: anim.speed ?? 1, amplitude: anim.amplitude ?? 1 }
    }
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
