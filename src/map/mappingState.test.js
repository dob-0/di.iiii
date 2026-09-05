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

describe('cues', () => {
    const withCue = (cue) => applyProjectOps(
        withSurfaces(['a', 'b']),
        [{ type: 'createMappingCue', payload: { cue: { id: 'c1', ...cue } } }]
    )

    it('keeps only keys 1-9', () => {
        expect(withCue({ key: '3' }).mappingState.cues[0].key).toBe('3')
        expect(withCue({ key: 'q' }).mappingState.cues[0].key).toBe('')
        expect(withCue({ key: '0' }).mappingState.cues[0].key).toBe('')
    })

    it('carries a lighting scene through the document, by id', () => {
        // The wall and the light in the room are one show. The cue stores the
        // desk's scene ID — a scene renamed at the venue must stay the scene
        // the cue means.
        const doc = withCue({ lightScene: 'sc-7' })
        expect(doc.mappingState.cues[0].lightScene).toBe('sc-7')
        expect(normalizeProjectDocument(doc).mappingState.cues[0].lightScene).toBe('sc-7')
    })

    it('leaves a cue that names no light exactly as it was', () => {
        // The field is optional and MUST stay absent when unused, or adding it
        // would rewrite every mapping that already exists.
        const cue = withCue({ name: 'Open' }).mappingState.cues[0]
        expect('lightScene' in cue).toBe(false)
    })

    it('sets and clears the lighting scene through the ordinary cue patch', () => {
        const set = applyProjectOps(withCue({}), [
            { type: 'setMappingCue', payload: { cueId: 'c1', patch: { lightScene: 'sc-7' } } }
        ])
        expect(set.mappingState.cues[0].lightScene).toBe('sc-7')

        // "— none —" in the picker is an empty string, and it has to mean the
        // field is gone rather than an empty scene id nobody can select.
        const cleared = applyProjectOps(set, [
            { type: 'setMappingCue', payload: { cueId: 'c1', patch: { lightScene: '' } } }
        ])
        expect('lightScene' in cleared.mappingState.cues[0]).toBe(false)
    })

    it('undoes naming a lighting scene', () => {
        const before = withCue({})
        const op = { type: 'setMappingCue', payload: { cueId: 'c1', patch: { lightScene: 'sc-7' } } }
        const after = applyProjectOps(before, [op])
        const back = applyProjectOps(after, invertProjectOps(before, [op]))
        expect('lightScene' in back.mappingState.cues[0]).toBe(false)
    })

    it('drops a surface entry that says nothing', () => {
        // An empty object reads like "this cue covers that surface" and would
        // make a capture look complete when it is not.
        const cue = withCue({ surfaces: { a: { enabled: false }, b: {} } }).mappingState.cues[0]
        expect(Object.keys(cue.surfaces)).toEqual(['a'])
    })

    it('holds no geometry, however hard a caller tries', () => {
        // The whole safety of a cue: firing one must never be able to move an
        // alignment somebody spent an afternoon on.
        const cue = withCue({ surfaces: { a: { enabled: true, corners: [[0, 0], [1, 0], [1, 1], [0, 1]], mask: [[0, 0]] } } })
            .mappingState.cues[0]
        expect(cue.surfaces.a).toEqual({ enabled: true })
    })

    it('replaces the surface map rather than merging it, so a surface can be dropped from a cue', () => {
        const doc = withCue({ surfaces: { a: { enabled: true }, b: { enabled: true } } })
        const after = applyProjectOps(doc, [{ type: 'setMappingCue', payload: { cueId: 'c1', patch: { surfaces: { a: { enabled: true } } } } }])
        expect(Object.keys(after.mappingState.cues[0].surfaces)).toEqual(['a'])
    })

    it('undoes a surface-map replace back to what it held', () => {
        const doc = withCue({ surfaces: { a: { enabled: true }, b: { enabled: true } } })
        const ops = [{ type: 'setMappingCue', payload: { cueId: 'c1', patch: { surfaces: { a: { enabled: false } } } } }]
        const restored = applyProjectOps(applyProjectOps(doc, ops), invertProjectOps(doc, ops))
        expect(Object.keys(restored.mappingState.cues[0].surfaces).sort()).toEqual(['a', 'b'])
    })

    it('forgets a surface everywhere when it is deleted', () => {
        const doc = withCue({ surfaces: { a: { enabled: true }, b: { enabled: true } } })
        const after = applyProjectOps(doc, [{ type: 'deleteMappingSurface', payload: { surfaceId: 'b' } }])
        expect(Object.keys(after.mappingState.cues[0].surfaces)).toEqual(['a'])
    })

    it('does not let an output patch clobber the cue list', () => {
        const doc = withCue({ name: 'one' })
        const after = applyProjectOps(doc, [{ type: 'setMappingState', payload: { patch: { fade: 2, cues: [] } } }])
        expect(after.mappingState.cues).toHaveLength(1)
        expect(after.mappingState.fade).toBe(2)
    })

    it('undoes a delete back into its place in the order', () => {
        const base = applyProjectOps(withSurfaces(['a']), ['c1', 'c2', 'c3'].map((id) => ({
            type: 'createMappingCue', payload: { cue: { id } }
        })))
        const ops = [{ type: 'deleteMappingCue', payload: { cueId: 'c2' } }]
        const after = applyProjectOps(base, ops)
        expect(after.mappingState.cues.map((cue) => cue.id)).toEqual(['c1', 'c3'])
        const restored = applyProjectOps(after, invertProjectOps(base, ops))
        expect(restored.mappingState.cues.map((cue) => cue.id)).toEqual(['c1', 'c2', 'c3'])
    })
})

describe('the reference photo and the grid', () => {
    it('clamps the grid to something a person could use', () => {
        expect(normalizeMappingState({ grid: -4 }).grid).toBe(0)
        expect(normalizeMappingState({ grid: 9999 }).grid).toBe(200)
        expect(normalizeMappingState({ grid: 24.6 }).grid).toBe(25)
    })

    it('defaults the wall photo to hidden', () => {
        expect(normalizeMappingState({}).reference).toEqual({ url: '', opacity: 0.5, visible: false })
    })
})

describe('creating a surface from another one', () => {
    it('never lets a copied id overwrite the new one', () => {
        // Duplicate passes the whole surface it is copying, `id` included. If
        // the caller's id wins, the op is a no-op against the existing surface
        // and the button does nothing at all, silently.
        const doc = withSurfaces(['a'])
        const copied = { ...doc.mappingState.surfaces[0], name: 'a copy' }
        const after = applyProjectOps(doc, [{ type: 'createMappingSurface', payload: { surface: { ...copied, id: 'b' } } }])
        expect(after.mappingState.surfaces.map((surface) => surface.id)).toEqual(['a', 'b'])
        expect(after.mappingState.surfaces[1].name).toBe('a copy')
    })
})
