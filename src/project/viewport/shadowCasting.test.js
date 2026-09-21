import { describe, expect, it } from 'vitest'
import {
    SHADOW_MAP_SIZES,
    defaultShadowCasting,
    dressForShadows,
    dressLightForShadows,
    resolveShadowCasting,
    shadowRoleOf
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
