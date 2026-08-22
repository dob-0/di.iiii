// Per-object proximity dimming, shared by the live viewer (LiveProjectScene)
// and the portal-embed pipeline so a lamp behaves the same inline as standalone.
//
// `components.proximity` makes an entity come up as a visitor walks toward it
// and go back down as they leave: gallery lighting that is off until someone is
// in front of the work. It scales two things, because a real light alone is not
// enough to see in every scene -- image/video planes render with an UNLIT basic
// material, so a spotlight on a photograph changes nothing. The visible half is
// therefore an emissive or translucent surface next to the work, dimmed by the
// same factor as the light itself.
//
// Absent component = always on, which is every entity authored before this.

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

export function resolveProximity(entity) {
    const p = entity?.components?.proximity
    if (!p) return null
    const radius = Number.isFinite(p.radius) ? Math.max(0.1, p.radius) : 4
    const falloff = Number.isFinite(p.falloff) ? Math.max(0.05, p.falloff) : 2
    const min = Number.isFinite(p.min) ? clamp01(p.min) : 0
    return { radius, falloff, min }
}

// 1 when the visitor is inside `radius - falloff`, 0 beyond `radius`, linear
// between, never below `min`.
export function proximityFactor(prox, distance) {
    if (!prox) return 1
    const t = clamp01((prox.radius - distance) / prox.falloff)
    return prox.min + (1 - prox.min) * t
}

// Base values are read once, from whatever the material/light was authored
// with, and kept on the object -- re-reading them each frame would compound the
// scaling down to zero after the first frame.
const baseOf = (object, key, value) => {
    const store = object.userData.__proximityBase || (object.userData.__proximityBase = {})
    if (store[key] === undefined) store[key] = value
    return store[key]
}

const dimMaterial = (material, factor) => {
    if (!material) return
    if (typeof material.emissiveIntensity === 'number') {
        material.emissiveIntensity = baseOf(material, 'emissiveIntensity', material.emissiveIntensity) * factor
    }
    if (material.transparent && typeof material.opacity === 'number') {
        material.opacity = baseOf(material, 'opacity', material.opacity) * factor
    }
}

// `group` is the entity's transform group; `cameraPosition` a THREE.Vector3.
// Returns the factor applied, so a caller can reuse it (tests, debug HUD).
export function applyProximity(group, prox, cameraPosition, tmpVector) {
    if (!group || !prox || !cameraPosition) return 1
    const here = group.getWorldPosition(tmpVector || group.position.clone())
    const factor = proximityFactor(prox, here.distanceTo(cameraPosition))
    group.traverse((object) => {
        if (object.isLight && typeof object.intensity === 'number') {
            object.intensity = baseOf(object, 'intensity', object.intensity) * factor
            return
        }
        if (!object.material) return
        if (Array.isArray(object.material)) object.material.forEach((m) => dimMaterial(m, factor))
        else dimMaterial(object.material, factor)
    })
    return factor
}
