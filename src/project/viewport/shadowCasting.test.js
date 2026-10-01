import { describe, expect, it } from 'vitest'
import {
    SHADOW_MAP_SIZES,
    defaultShadowCasting,
    dressForShadows,
    dressLightForShadows,
    resolveShadowCasting,
    shadowRoleOf,
    undressShadows
} from './shadowCasting.js'

const spotLight = (distance = 20) => ({
    isSpotLight: true,
    distance,
    children: [],
    shadow: { mapSize: { width: 512, height: 512 }, camera: { near: 0.1, far: 2000 } }
})

const mesh = (extra = {}) => ({ isMesh: true, children: [], material: {}, userData: {}, ...extra })

describe('shadows from the room', () => {
    it('is off in every room that has not asked for it', () => {
        // The compatibility promise. `renderSettings.shadows` has defaulted to
        // true since the schema was written, so an absent new field must NOT be
        // read as "on" — that would put a shadow pass on every published space.
        expect(resolveShadowCasting(undefined).enabled).toBe(false)
        expect(resolveShadowCasting({}).enabled).toBe(false)
        expect(resolveShadowCasting({ shadows: true }).enabled).toBe(false)
        expect(resolveShadowCasting({ shadowCasting: {} }).enabled).toBe(false)
        expect(defaultShadowCasting.enabled).toBe(false)
    })

    it('needs both switches: shadow maps allowed, and the room casting', () => {
        expect(resolveShadowCasting({ shadowCasting: { enabled: true } }).enabled).toBe(true)
        expect(resolveShadowCasting({ shadows: false, shadowCasting: { enabled: true } }).enabled).toBe(false)
    })

    it('takes a map size it knows and ignores one it does not', () => {
        expect(resolveShadowCasting({ shadowCasting: { enabled: true, mapSize: 2048 } }).mapSize).toBe(2048)
        expect(resolveShadowCasting({ shadowCasting: { enabled: true, mapSize: 99 } }).mapSize).toBe(1024)
        expect(resolveShadowCasting({ shadowCasting: { enabled: true } }).mapSize).toBe(1024)
        expect(SHADOW_MAP_SIZES).toContain(1024)
    })

    it('dresses the solid scenery and leaves the furniture alone', () => {
        const scene = {
            children: [
                mesh({ name: 'pillar' }),
                mesh({ name: 'floor' }),
                // the reference grid and anything else flagged
                mesh({ name: 'grid', userData: { noShadow: true } }),
                // the beam: light in the air, not matter
                mesh({ name: 'beam', material: { depthWrite: false } }),
                { type: 'TransformControlsGizmo', children: [mesh({ name: 'gizmo-arrow' })] },
                { isMesh: false, children: [mesh({ name: 'model-part' })] }
            ]
        }
        expect(dressForShadows(scene).meshes).toBe(3)
        const byName = Object.fromEntries(scene.children.map((c) => [c.name || c.type, c]))
        expect(byName.pillar.castShadow).toBe(true)
        expect(byName.pillar.receiveShadow).toBe(true)
        expect(byName['model-part']).toBeUndefined() // nested, but counted above
        expect(byName.grid.castShadow).toBeUndefined()
        expect(byName.beam.castShadow).toBeUndefined()
        expect(byName.TransformControlsGizmo.children[0].castShadow).toBeUndefined()
    })

    it('reaches meshes that arrived inside a loaded model', () => {
        const part = mesh({ name: 'wall' })
        const scene = { children: [{ isMesh: false, children: [{ isMesh: false, children: [part] }] }] }
        dressForShadows(scene)
        expect(part.castShadow).toBe(true)
    })

    it('never switches a flag off', () => {
        // ModelObject already marks its own meshes; a room with shadows off is
        // left exactly as it was, because nothing casts into the map anyway.
        const already = mesh({ castShadow: true, userData: { noShadow: true } })
        dressForShadows({ children: [already] })
        expect(already.castShadow).toBe(true)
    })

    it('makes the lamps throw, with a shadow camera the size of their throw', () => {
        const lamp = spotLight(14)
        expect(dressLightForShadows(lamp, 2048)).toBe(true)
        expect(lamp.castShadow).toBe(true)
        expect(lamp.shadow.mapSize.width).toBe(2048)
        expect(lamp.shadow.camera.near).toBe(0.5)
        expect(lamp.shadow.camera.far).toBe(14)
        // An unlimited lamp (distance 0 means no limit to three.js) still needs
        // a far plane.
        const open = spotLight(0)
        dressLightForShadows(open, 1024)
        expect(open.shadow.camera.far).toBe(20)
    })

    it('throws away a shadow map whose size changed, or the setting does nothing', () => {
        const lamp = spotLight()
        let disposed = false
        lamp.shadow.map = { dispose: () => { disposed = true } }
        dressLightForShadows(lamp, 2048)
        expect(disposed).toBe(true)
        expect(lamp.shadow.map).toBe(null)
    })

    it('leaves the other kinds of lamp alone', () => {
        // A directional light needs a frustum sized to the room, not to a
        // throw: its own change, deliberately not made here.
        expect(dressLightForShadows({ isDirectionalLight: true, children: [] }, 1024)).toBe(false)
        expect(dressLightForShadows({ isPointLight: true, children: [] }, 1024)).toBe(false)
        expect(dressLightForShadows(null, 1024)).toBe(false)
    })

    it('finds the lamps in the same walk as the scenery', () => {
        const scene = { children: [mesh(), { isMesh: false, children: [spotLight()] }] }
        expect(dressForShadows(scene, 1024)).toEqual({ meshes: 1, lights: 1 })
    })

    it('says what to do with nothing at all', () => {
        expect(shadowRoleOf(null)).toBe('skip')
        expect(shadowRoleOf({})).toBe('skip')
        expect(dressForShadows({})).toEqual({ meshes: 0, lights: 0 })
    })
})

// THE SWITCH GOES BOTH WAYS. Turning "Lamps throw shadows" off used to do
// nothing until the page reloaded: the flags stayed stamped on, and
// gl.shadowMap.enabled tracks the older `shadows` field and is true anyway.
describe('undressing', () => {
    const aMesh = (castShadow = false) => ({
        isMesh: true,
        castShadow,
        receiveShadow: false,
        material: { transparent: false, depthWrite: true },
        userData: {},
        children: []
    })

    it('puts a mesh back the way it found it', () => {
        const mesh = aMesh()
        const root = { children: [mesh], userData: {} }
        dressForShadows(root, 1024)
        expect(mesh.castShadow).toBe(true)
        undressShadows(root)
        expect(mesh.castShadow).toBe(false)
        expect(mesh.receiveShadow).toBe(false)
    })

    // A model marks its own meshes when the file arrives, and that is not ours
    // to clear: a room switched on and off must not end up darker than it began.
    it('leaves a flag somebody else set alone', () => {
        const mesh = aMesh(true)
        const root = { children: [mesh], userData: {} }
        dressForShadows(root, 1024)
        undressShadows(root)
        expect(mesh.castShadow, 'the model set this, not us').toBe(true)
    })

    // Re-dressing runs twice a second; the FIRST answer is the true one.
    it('does not let re-dressing overwrite what it remembered', () => {
        const mesh = aMesh(false)
        const root = { children: [mesh], userData: {} }
        dressForShadows(root, 1024)
        dressForShadows(root, 1024)
        dressForShadows(root, 1024)
        undressShadows(root)
        expect(mesh.castShadow).toBe(false)
    })
})

// MOXIR Known · full, 2026-10-01: every lamp a real light (64). A browser has 16–32 texture
// units and every shadow-casting lamp takes one in every lit material, so past ~12 the room
// fails to compile and goes black — the shadows were switched off for the whole room.
// Now a fixed number of lamps throw: the ones putting the most light into the room.
describe('shadows for a room of many lamps', () => {
    const lamp = (name, intensity, angle = 0.3) => ({ ...spotLight(), name, intensity, angle, uuid: name })
    it('gives a shadow to exactly the cap, the lamps throwing the most light, and the count never changes', () => {
        const lamps = Array.from({ length: 20 }, (_, i) => lamp(`l${String(i).padStart(2, '0')}`, i < 5 ? 0 : i * 10))
        const root = { children: [mesh(), ...lamps] }
        const out = dressForShadows(root, 1024, { maxLights: 12 })
        expect(out.lights).toBe(12)
        expect(lamps.filter((l) => l.castShadow).length).toBe(12)
        expect(lamps.slice(8).every((l) => l.castShadow)).toBe(true) // l08…l19, the brightest
        expect(lamps.slice(0, 5).some((l) => l.castShadow)).toBe(false) // dark lamps never take one while lit ones wait
        lamps[19].intensity = 0 // a fade takes the brightest down: the next one up takes its shadow
        dressForShadows(root, 1024, { maxLights: 12 })
        expect(lamps.filter((l) => l.castShadow).length).toBe(12)
        expect(lamps[19].castShadow).toBe(false)
        expect(lamps[7].castShadow).toBe(true)
    })
    it('keeps a shadow on its lamp against a challenger that is only a little brighter', () => {
        const a = lamp('a', 100)
        const b = lamp('b', 50)
        const root = { children: [a, b] }
        dressForShadows(root, 1024, { maxLights: 1 })
        expect(a.castShadow).toBe(true)
        b.intensity = 110 // 10 % over: not enough to take it
        dressForShadows(root, 1024, { maxLights: 1 })
        expect(a.castShadow).toBe(true)
        expect(b.castShadow).toBe(false)
        b.intensity = 130
        dressForShadows(root, 1024, { maxLights: 1 })
        expect(b.castShadow).toBe(true)
        expect(a.castShadow).toBe(false)
    })
    it('puts every lamp back on undress, the uncapped ones too', () => {
        const lamps = Array.from({ length: 4 }, (_, i) => lamp(`u${i}`, 10 + i))
        const root = { children: lamps }
        dressForShadows(root, 1024, { maxLights: 2 })
        undressShadows(root)
        expect(lamps.every((l) => l.castShadow === false)).toBe(true)
    })
})

// Seen 2026-10-01 (Chrome, ANGLE D3D11: 16 units): the cap must leave room for what each
// lit material samples itself. A fixed reserve guessed how many maps a material carries;
// a textured model with more would push the shader past the GPU's units and the room
// goes black. The units are counted from the scene instead.
describe('the shadow cap counts the units the materials use', () => {
    const lamp = (name, intensity) => ({ ...spotLight(), name, intensity, angle: 0.3, uuid: name })
    const tex = { isTexture: true }
    it('gives the lamps only the units the busiest lit material leaves, one spare', () => {
        const lamps = Array.from({ length: 20 }, (_, i) => lamp(`m${String(i).padStart(2, '0')}`, 10 + i))
        const busy = mesh({ material: { map: tex, normalMap: tex, roughnessMap: tex, metalnessMap: tex, aoMap: tex, emissiveMap: tex } })
        const root = { children: [busy, mesh(), ...lamps] }
        dressForShadows(root, 1024, { maxLights: 12, maxTextures: 16 })
        expect(lamps.filter((l) => l.castShadow).length).toBe(16 - 6 - 1)
    })
    it('counts the scene environment on a standard material, and another light\'s shadow', () => {
        const lamps = Array.from({ length: 20 }, (_, i) => lamp(`e${String(i).padStart(2, '0')}`, 10 + i))
        const sun = { isDirectionalLight: true, isLight: true, castShadow: true, children: [] }
        const root = { environment: tex, children: [mesh({ material: { isMeshStandardMaterial: true, map: tex } }), sun, ...lamps] }
        dressForShadows(root, 1024, { maxLights: 12, maxTextures: 14 })
        expect(lamps.filter((l) => l.castShadow).length).toBe(14 - 2 - 1 - 1) // map + environment, the sun, one spare
    })
    it('still never gives more than the cap on a GPU with room to spare', () => {
        const lamps = Array.from({ length: 20 }, (_, i) => lamp(`p${String(i).padStart(2, '0')}`, 10 + i))
        dressForShadows({ children: [mesh(), ...lamps] }, 1024, { maxLights: 12, maxTextures: 32 })
        expect(lamps.filter((l) => l.castShadow).length).toBe(12)
    })
})
