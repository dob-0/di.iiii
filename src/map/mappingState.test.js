import { describe, expect, it } from 'vitest'
import {
    applyProjectOps,
    invertProjectOps,
    normalizeMappingState,
    normalizeProjectDocument
} from '../shared/projectSchema.js'

const withSurfaces = (ids) => applyProjectOps(
    normalizeProjectDocument({}),
    ids.map((id) => ({ type: 'createMappingSurface', payload: { surface: { id } } }))
)

describe('mappingState in the project document', () => {
    it('survives a normalize round-trip', () => {
        // The normalizer drops every top-level key it does not know about, so
        // a mapping stored beside the schema rather than in it would be
        // erased by the next write and nobody would see it happen.
        const once = normalizeProjectDocument({ mappingState: { surfaces: [{ id: 'a' }] } })
        const twice = normalizeProjectDocument(once)
        expect(twice.mappingState.surfaces.map((surface) => surface.id)).toEqual(['a'])
    })

    it('repairs a surface that lost corners rather than leaving it unsolvable', () => {
        const state = normalizeMappingState({ surfaces: [{ id: 'a', corners: [[0, 0], [1, 0]] }] })
        expect(state.surfaces[0].corners).toHaveLength(4)
    })

    it('keeps a mask that is still being drawn', () => {
        // One or two points is a shape mid-trace. Dropping them made it
        // impossible to draw a mask click by click at all; nothing is clipped
        // until there are three, which maskToClipPath enforces.
        const state = normalizeMappingState({ surfaces: [{ id: 'a', mask: [[0, 0], [1, 1]] }] })
        expect(state.surfaces[0].mask).toEqual([[0, 0], [1, 1]])
    })

    it('has no mask at all when the field is not a list', () => {
        expect(normalizeMappingState({ surfaces: [{ id: 'a', mask: 'nope' }] }).surfaces[0].mask).toEqual([])
    })

    it('drops surfaces with no id and dedupes repeated ids', () => {
        const state = normalizeMappingState({ surfaces: [{ id: 'a' }, { id: 'a', name: 'second' }, { name: 'anonymous' }] })
        expect(state.surfaces).toHaveLength(1)
        expect(state.surfaces[0].name).toBe('')
    })

    it('falls back to a known kind for an unknown source', () => {
        const state = normalizeMappingState({ surfaces: [{ id: 'a', source: { kind: 'wormhole', ref: 'x' } }] })
        expect(state.surfaces[0].source.kind).toBe('test')
    })

    it('clamps opacity and refuses a zero-sized source box', () => {
        const state = normalizeMappingState({ surfaces: [{ id: 'a', opacity: 4, resolution: [0, -20] }] })
        expect(state.surfaces[0].opacity).toBe(1)
        expect(state.surfaces[0].resolution).toEqual([1, 1])
    })
})

describe('mapping ops', () => {
    it('keeps surfaces in paint order', () => {
        expect(withSurfaces(['a', 'b', 'c']).mappingState.surfaces.map((surface) => surface.id)).toEqual(['a', 'b', 'c'])
    })

    it('will not create the same surface twice', () => {
        const doc = applyProjectOps(withSurfaces(['a']), [{ type: 'createMappingSurface', payload: { surface: { id: 'a', name: 'clobber' } } }])
        expect(doc.mappingState.surfaces).toHaveLength(1)
        expect(doc.mappingState.surfaces[0].name).toBe('')
    })

    it('patches one surface without touching its neighbours', () => {
        const doc = applyProjectOps(withSurfaces(['a', 'b']), [{ type: 'setMappingSurface', payload: { surfaceId: 'a', patch: { opacity: 0.5 } } }])
        expect(doc.mappingState.surfaces[0].opacity).toBe(0.5)
        expect(doc.mappingState.surfaces[1].opacity).toBe(1)
    })

    it('does not let an output patch carry a stale surface list', () => {
        // Two people at one wall: the operator changes the output resolution
        // while somebody else is dragging a corner. Without the pin in
        // setMappingState the resolution change would take the surfaces the
        // operator last saw and undo the drag.
        const doc = applyProjectOps(withSurfaces(['a']), [{
            type: 'setMappingState',
            payload: { patch: { output: { width: 1280, height: 800 }, surfaces: [] } }
        }])
        expect(doc.mappingState.output).toEqual({ width: 1280, height: 800 })
        expect(doc.mappingState.surfaces).toHaveLength(1)
    })

    it('reorders without ever deleting an unnamed surface', () => {
        const doc = applyProjectOps(withSurfaces(['a', 'b', 'c']), [{ type: 'reorderMappingSurfaces', payload: { surfaceIds: ['c', 'a'] } }])
        expect(doc.mappingState.surfaces.map((surface) => surface.id)).toEqual(['b', 'c', 'a'])
    })

    it('undoes a delete back into its original place in the order', () => {
        const doc = withSurfaces(['a', 'b', 'c'])
        const ops = [{ type: 'deleteMappingSurface', payload: { surfaceId: 'b' } }]
        const after = applyProjectOps(doc, ops)
        expect(after.mappingState.surfaces.map((surface) => surface.id)).toEqual(['a', 'c'])
        const restored = applyProjectOps(after, invertProjectOps(doc, ops))
        expect(restored.mappingState.surfaces.map((surface) => surface.id)).toEqual(['a', 'b', 'c'])
    })

    it('undoes a surface patch', () => {
        const doc = applyProjectOps(withSurfaces(['a']), [{ type: 'setMappingSurface', payload: { surfaceId: 'a', patch: { name: 'ԳՈՌ' } } }])
        const ops = [{ type: 'setMappingSurface', payload: { surfaceId: 'a', patch: { name: 'wrong', opacity: 0.2 } } }]
        const restored = applyProjectOps(applyProjectOps(doc, ops), invertProjectOps(doc, ops))
        expect(restored.mappingState.surfaces[0].name).toBe('ԳՈՌ')
        expect(restored.mappingState.surfaces[0].opacity).toBe(1)
    })

    it('inverts a re-create of an existing surface to nothing', () => {
        const doc = withSurfaces(['a'])
        const ops = [{ type: 'createMappingSurface', payload: { surface: { id: 'a' } } }]
        expect(invertProjectOps(doc, ops)).toEqual([])
    })

    it('ignores ops naming a surface that is not there', () => {
        const doc = withSurfaces(['a'])
        const after = applyProjectOps(doc, [
            { type: 'setMappingSurface', payload: { surfaceId: 'ghost', patch: { opacity: 0 } } },
            { type: 'deleteMappingSurface', payload: { surfaceId: 'ghost' } }
        ])
        expect(after.mappingState.surfaces).toHaveLength(1)
        expect(after.mappingState.surfaces[0].opacity).toBe(1)
    })
})
