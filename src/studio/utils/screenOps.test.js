import { describe, expect, it } from 'vitest'
import { applyProjectOps, invertProjectOps } from '../../shared/projectSchema.js'
import { buildScreenOps, buildVideoToScreenOps, describeSurfaceSource, findPictureSource, screenSurfaceOptions } from './screenOps.js'

const doc = (extra = {}) => ({ entities: [], nodes: [], mappingState: { surfaces: [] }, ...extra })
const deck = { id: 'node-deck', typeId: 'vj.deck', label: 'Main' }
const out = { id: 'node-out', typeId: 'top.out', label: 'Out' }

describe('buildScreenOps', () => {
    it('makes a standing 16:9 plane named Screen, and a network surface on the first deck', () => {
        const made = buildScreenOps(doc({ nodes: [out, deck] }), { position: [1, 0, 2] })
        expect(made.bound).toBe(true)
        expect(made.createdSurface).toBe(true)
        expect(made.ops.map((op) => op.type)).toEqual(['createMappingSurface', 'createEntity'])
        expect(made.ops[0].payload.surface.source).toEqual({ kind: 'network', ref: 'node-deck' })
        const c = made.entity.components
        expect(made.entity.name).toBe('Screen')
        expect(made.entity.type).toBe('plane')
        expect(c.surface.surfaceId).toBe(made.surfaceId)
        expect(c.primitive.width / c.primitive.depth).toBeCloseTo(16 / 9, 2)
        expect(c.transform.position).toEqual([1, 0.9, 2])
    })

    it('falls back to the first Picture Out when there is no deck', () => {
        expect(findPictureSource(doc({ nodes: [out] })).id).toBe('node-out')
        expect(buildScreenOps(doc({ nodes: [out] })).ops[0].payload.surface.source.ref).toBe('node-out')
    })

    it('binds to an existing picture surface instead of making another', () => {
        const d = doc({ nodes: [deck], mappingState: { surfaces: [{ id: 'srf-1', name: 'Wall', source: { kind: 'colour', ref: '#000' } }, { id: 'srf-2', name: 'Deck wall', source: { kind: 'network', ref: 'node-deck' } }] } })
        const made = buildScreenOps(d)
        expect(made.createdSurface).toBe(false)
        expect(made.surfaceId).toBe('srf-2')
        expect(made.ops.map((op) => op.type)).toEqual(['createEntity'])
    })

    it('skips a surface whose deck was deleted and makes one on the live deck', () => {
        const d = doc({ nodes: [deck], mappingState: { surfaces: [{ id: 'srf-dead', name: 'Old', source: { kind: 'network', ref: 'node-gone' } }] } })
        const made = buildScreenOps(d)
        expect(made.createdSurface).toBe(true)
        expect(made.surfaceId).not.toBe('srf-dead')
        expect(made.ops[0].payload.surface.source).toEqual({ kind: 'network', ref: 'node-deck' })
    })

    it('skips a surface whose ref is a node that is not a picture source', () => {
        const other = { id: 'node-lamp', typeId: 'light.lamp' }
        const d = doc({ nodes: [other, deck], mappingState: { surfaces: [{ id: 'srf-lamp', source: { kind: 'network', ref: 'node-lamp' } }] } })
        const made = buildScreenOps(d)
        expect(made.surfaceId).not.toBe('srf-lamp')
        expect(made.ops[0].payload.surface.source.ref).toBe('node-deck')
    })

    it('with only a dead surface and no deck, stays unbound', () => {
        const d = doc({ mappingState: { surfaces: [{ id: 'srf-dead', source: { kind: 'network', ref: 'node-gone' } }] } })
        expect(buildScreenOps(d).bound).toBe(false)
    })

    it('with neither deck nor out makes the plane unbound', () => {
        const made = buildScreenOps(doc())
        expect(made.bound).toBe(false)
        expect(made.ops).toHaveLength(1)
        expect(made.entity.components.surface).toBeUndefined()
    })

    it('applies through the project schema: surface and entity both land', () => {
        const d = doc({ nodes: [deck] })
        const made = buildScreenOps(d)
        const next = applyProjectOps(d, made.ops)
        expect(next.mappingState.surfaces.find((s) => s.id === made.surfaceId).source).toMatchObject({ kind: 'network', ref: 'node-deck' })
        expect(next.entities.find((e) => e.id === made.entity.id).components.surface.surfaceId).toBe(made.surfaceId)
    })
})

describe('buildVideoToScreenOps', () => {
    const video = { id: 'e-vid', type: 'video', name: 'Loop', parentId: null, components: { transform: { position: [4, 1, 5], rotation: [0, 1, 0], scale: [2, 2, 2] }, media: { assetId: 'asset-9' } } }
    it('moves the video children under the Screen, and undo puts them back under the video', () => {
        const child = { id: 'e-child', type: 'box', name: 'Frame', parentId: 'e-vid', components: {} }
        const grand = { id: 'e-grand', type: 'box', name: 'Bolt', parentId: 'e-child', components: {} }
        const d = doc({ nodes: [deck], entities: [video, child, grand] })
        const made = buildVideoToScreenOps(d, video)
        expect(made.movedChildren).toBe(1)
        const next = applyProjectOps(d, made.ops)
        const byId = (doc, id) => doc.entities.find((e) => e.id === id)
        expect(byId(next, 'e-vid')).toBeUndefined()
        expect(byId(next, 'e-child').parentId).toBe(made.entity.id)
        expect(byId(next, 'e-grand').parentId).toBe('e-child')
        const undo = invertProjectOps(d, made.ops)
        const back = applyProjectOps(next, undo)
        expect(byId(back, 'e-vid')).toBeTruthy()
        expect(byId(back, 'e-child').parentId).toBe('e-vid')
        expect(byId(back, 'e-grand').parentId).toBe('e-child')
        expect(byId(back, made.entity.id)).toBeUndefined()
    })

    it('keeps the transform, removes the video in the same batch', () => {
        const made = buildVideoToScreenOps(doc({ nodes: [deck], entities: [video] }), video)
        expect(made.ops.map((op) => op.type)).toEqual(['createMappingSurface', 'createEntity', 'deleteEntity'])
        expect(made.ops[2].payload.entityId).toBe('e-vid')
        expect(made.entity.components.transform.position).toEqual([4, 1, 5])
        expect(made.entity.components.transform.rotation).toEqual([0, 1, 0])
        expect(made.entity.components.transform.scale).toEqual([2, 2, 2])
    })
    it('refuses a non-video', () => {
        expect(buildVideoToScreenOps(doc(), { id: 'x', type: 'box' })).toBeNull()
    })
    it('the video, with its asset, is untouched in the removed entity (undo has it)', () => {
        expect(video.components.media.assetId).toBe('asset-9')
    })
})

describe('labels', () => {
    it('names each surface by its source', () => {
        const d = doc({ nodes: [deck], mappingState: { surfaces: [{ id: 's', name: 'Wall', source: { kind: 'network', ref: 'node-deck' } }, { id: 't', name: '', source: { kind: 'project', ref: 'p' } }] } })
        expect(screenSurfaceOptions(d)).toEqual([{ value: 's', label: 'Wall — VJ Deck Main' }, { value: 't', label: 't — 3D scene' }])
        expect(describeSurfaceSource({ source: { kind: 'url' } }, d)).toBe('Web page')
    })
})
