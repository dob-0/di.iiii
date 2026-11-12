import { describe, expect, it } from 'vitest'
import { deckSurface, liveEntity, liveId, planWallLive, surfaceIdFor } from './wall-live.mjs'

const wall = { id: 'w', type: 'box', components: { transform: { position: [1, 0, -2], rotation: [0, 0, 0], scale: [4, 2.5, 0.2] } } }
const still = { id: 'w-picture', type: 'image', components: {} }
const deck = { id: 'deck-1', typeId: 'vj.deck', values: {} }
const docOf = (extra = {}) => ({ entities: [wall, still], nodes: [deck], mappingState: { surfaces: [] }, ...extra })
const types = (plan) => plan.ops.map((o) => o.type)

describe('wall-live: the ops for a document', () => {
    it('with no deck surface: makes the surface in the real shape, then ONE plane', () => {
        const plan = planWallLive(docOf(), { wallId: 'w' })
        expect(types(plan)).toEqual(['createMappingSurface', 'createEntity'])
        const surface = plan.ops[0].payload.surface
        expect(surface).toMatchObject({ id: surfaceIdFor('w'), enabled: true, source: { kind: 'network', ref: 'deck-1' }, resolution: [1280, 800] })
        expect(surface.corners).toEqual([[0, 0], [1, 0], [1, 1], [0, 1]])
        expect(plan.ops[1].payload.entity.components.surface).toEqual({ surfaceId: surfaceIdFor('w') })
    })
    it('with a deck surface already: reuses it, only the plane is made', () => {
        const surface = deckSurface({ id: 'srf-x', name: 'x', deckNodeId: 'deck-1', width: 1280, height: 800 })
        const plan = planWallLive(docOf({ mappingState: { surfaces: [surface] } }), { wallId: 'w' })
        expect(types(plan)).toEqual(['createEntity'])
        expect(plan.surfaceId).toBe('srf-x')
    })
    it('a surface given by --surface is used when it exists', () => {
        const other = { id: 'srf-y', source: { kind: 'network', ref: 'deck-1' } }
        const plan = planWallLive(docOf({ mappingState: { surfaces: [other] } }), { wallId: 'w', surfaceId: 'srf-y' })
        expect(plan.surfaceId).toBe('srf-y')
        expect(types(plan)).toEqual(['createEntity'])
    })
    it('run twice: the second run makes nothing', () => {
        const first = planWallLive(docOf(), { wallId: 'w' })
        const doc = docOf({ mappingState: { surfaces: [first.ops[0].payload.surface] }, entities: [wall, still, first.ops[1].payload.entity] })
        const second = planWallLive(doc, { wallId: 'w' })
        expect(second.ops).toEqual([])
        expect(second.surfaceId).toBe(surfaceIdFor('w'))
    })
    it('no deck and no surface is an error, a missing or turned wall too', () => {
        expect(() => planWallLive(docOf({ nodes: [] }), { wallId: 'w' })).toThrow(/no vj.deck/)
        expect(() => planWallLive(docOf(), { wallId: 'nope' })).toThrow(/no entity nope/)
        expect(() => planWallLive(docOf({ entities: [{ ...wall, components: { transform: { ...wall.components.transform, rotation: [0, 1, 0] } } }] }), { wallId: 'w' })).toThrow(/turned/)
        expect(() => planWallLive(docOf(), { wallId: 'w', mode: 'x' })).toThrow(/--mode/)
    })
    it('--mode still hides the live plane and shows the still; --mode live shows the live plane', () => {
        const live = liveEntity({ wall, surfaceId: 's' })
        const hidden = { ...live, components: { ...live.components, runtime: { visible: false } } }
        const stillHidden = { ...still, components: { runtime: { visible: false } } }
        const doc = (e, s) => docOf({ entities: [wall, s, e], mappingState: { surfaces: [{ id: 's' }] } })
        const toStill = planWallLive(doc(live, stillHidden), { wallId: 'w', mode: 'still' })
        expect(toStill.ops.map((o) => [o.payload.entityId, o.payload.patch.visible])).toEqual([[liveId('w'), false], ['w-picture', true]])
        const toLive = planWallLive(doc(hidden, still), { wallId: 'w', mode: 'live' })
        expect(toLive.ops.map((o) => [o.payload.entityId, o.payload.patch.visible])).toEqual([[liveId('w'), true]])
        expect(planWallLive(doc(hidden, still), { wallId: 'w', mode: 'still' }).ops).toEqual([])
    })
})

describe('wall-live: the plane', () => {
    const e = liveEntity({ wall, surfaceId: 's' })
    it('has the wall width and height, stands upright facing +z, in front of the face and of the still', () => {
        expect(e.type).toBe('plane')
        expect(e.id).toBe('w-live')
        expect(e.components.primitive).toEqual({ width: 4, depth: 2.5 })
        expect(e.components.transform.position).toEqual([1, 1.25, -2 + 0.1 + 0.01])
        expect(e.components.transform.rotation[0]).toBeCloseTo(Math.PI / 2, 5)
        expect(e.components.transform.scale).toEqual([1, 1, 1])
    })
    it('is static, so walk mode gives it no idle drift', () => {
        expect(e.components.animation.mode).toBe('static')
        expect(e.components.surface).toEqual({ surfaceId: 's' })
    })
})
