import { describe, expect, it } from 'vitest'
import { createOps, mediaAssetIds, missingEntities } from './restore-entities.mjs'

const img = (id, assetId) => ({ id, type: 'image', components: { media: { assetId } } })

describe('restore-entities', () => {
    // The 2026-09-18 shape: the saved room held the deck, the current one does not.
    const saved = { entities: [img('a', 'x1'), img('b', 'x2'), { id: 'door', type: 'portal' }] }
    const current = { entities: [{ id: 'door', type: 'portal' }] }

    it('restores only what the current document no longer has', () => {
        expect(missingEntities(saved, current).map((e) => e.id)).toEqual(['a', 'b'])
    })

    it('never re-creates an entity that is still there', () => {
        expect(missingEntities(saved, { entities: saved.entities })).toEqual([])
    })

    it('filters by type when asked', () => {
        expect(missingEntities({ entities: [...saved.entities, { id: 't', type: 'text' }] }, current, ['text']).map((e) => e.id)).toEqual(['t'])
    })

    it('lists each media file once', () => {
        expect(mediaAssetIds([img('a', 'x1'), img('b', 'x1'), { id: 'c', type: 'cone' }])).toEqual(['x1'])
    })

    it('makes one createEntity op per entity, each with its own op id and the entity id kept', () => {
        const ops = createOps(saved.entities.slice(0, 2))
        expect(ops.map((o) => o.type)).toEqual(['createEntity', 'createEntity'])
        expect(ops.map((o) => o.payload.entity.id)).toEqual(['a', 'b'])
        expect(new Set(ops.map((o) => o.opId)).size).toBe(2)
    })
})
