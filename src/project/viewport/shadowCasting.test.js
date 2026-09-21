import { describe, expect, it } from 'vitest'
import {
    SHADOW_MAP_SIZES,
    defaultShadowCasting,
    dressForShadows,
    resolveShadowCasting,
    shadowRoleOf
} from './shadowCasting.js'

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
        expect(dressForShadows(scene)).toBe(3)
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

    it('says what to do with nothing at all', () => {
        expect(shadowRoleOf(null)).toBe('skip')
        expect(shadowRoleOf({})).toBe('skip')
        expect(dressForShadows({})).toBe(0)
    })
})
