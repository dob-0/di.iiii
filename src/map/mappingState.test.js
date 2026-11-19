import { describe, expect, it } from 'vitest'
import {
    applyProjectOps,
    defaultMappingSurface,
    invertProjectOps,
    normalizeMappingCue,
    normalizeMappingEffects,
    normalizeMappingState,
    normalizeMappingVisual,
    normalizeMappingSurface,
    normalizeProjectDocument,
    regularWarpGrid
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

describe('motion glow on a surface', () => {
    it('is off on a surface that never asked for it, and survives an edit to one knob', () => {
        let document = withSurfaces(['cam'])
        expect(document.mappingState.surfaces[0].effect).toEqual({ kind: 'none', threshold: 0.08, trail: 0.88, gain: 4, prompt: '', strength: 0.5 })
        document = applyProjectOps(document, [{ type: 'setMappingSurface', payload: { surfaceId: 'cam', patch: { effect: { kind: 'motion' } } } }])
        document = applyProjectOps(document, [{ type: 'setMappingSurface', payload: { surfaceId: 'cam', patch: { effect: { trail: 0.5 } } } }])
        expect(document.mappingState.surfaces[0].effect).toEqual({ kind: 'motion', threshold: 0.08, trail: 0.5, gain: 4, prompt: '', strength: 0.5 })
    })

    it('refuses a trail that never fades and an effect it does not know', () => {
        const state = normalizeMappingState({ surfaces: [{ id: 'cam', effect: { kind: 'sparkles', trail: 1, gain: 99, threshold: -1 } }] })
        expect(state.surfaces[0].effect).toEqual({ kind: 'none', threshold: 0, trail: 0.99, gain: 20, prompt: '', strength: 0.5 })
    })
})

describe('AI restyle on a surface', () => {
    it('keeps its prompt and strength through an edit to one knob', () => {
        let document = withSurfaces(['cam'])
        document = applyProjectOps(document, [{ type: 'setMappingSurface', payload: { surfaceId: 'cam', patch: { effect: { kind: 'ai', prompt: 'oil painting, deep blue' } } } }])
        document = applyProjectOps(document, [{ type: 'setMappingSurface', payload: { surfaceId: 'cam', patch: { effect: { strength: 0.8 } } } }])
        expect(document.mappingState.surfaces[0].effect).toMatchObject({ kind: 'ai', prompt: 'oil painting, deep blue', strength: 0.8 })
    })

    it('bounds the prompt and the strength', () => {
        const state = normalizeMappingState({ surfaces: [{ id: 'cam', effect: { kind: 'ai', prompt: 'x'.repeat(5000), strength: 7 } }] })
        expect(state.surfaces[0].effect.prompt).toHaveLength(300)
        expect(state.surfaces[0].effect.strength).toBe(1)
        expect(normalizeMappingState({ surfaces: [{ id: 'cam', effect: { kind: 'ai', strength: 0 } }] }).surfaces[0].effect.strength).toBe(0.05)
    })
})

describe('what a new surface is born showing', () => {
    it('is the dim identification card, not the bright alignment grid', () => {
        // The rig is two machines. A new surface is on the projector the
        // instant Add is pressed, and white never goes on a projector.
        expect(defaultMappingSurface.source).toEqual({ kind: 'test', ref: 'card' })
    })

    it('is stored as a ref, because an older build would rewrite an unknown KIND', () => {
        // This is the whole reason the card is a pattern and not a new
        // `source.kind`. MAPPING_SOURCE_KINDS is a closed list: a build that
        // predates a new kind replaces it with the default kind and the
        // surface's source is gone for good. A `ref` is a free string and
        // comes back byte-identical, so an old build merely draws the grid
        // for an afternoon and a new one shows the card again.
        expect(normalizeMappingSurface({ id: 'a', source: { kind: 'card', ref: '' } }).source)
            .toEqual({ kind: 'test', ref: '' })
        expect(normalizeMappingSurface({ id: 'a', source: { kind: 'test', ref: 'card' } }).source)
            .toEqual({ kind: 'test', ref: 'card' })
        expect(normalizeMappingSurface({ id: 'a', source: { kind: 'test', ref: 'a-later-pattern' } }).source.ref)
            .toBe('a-later-pattern')
    })

    it('keeps an NDI source by name, through a write and back', () => {
        // The ref is a source NAME and nothing else — no address is ever
        // stored, because the sender chooses which of its interfaces to
        // advertise and that choice does not survive the night.
        const document = applyProjectOps(normalizeProjectDocument({}), [
            { type: 'createMappingSurface', payload: { surface: { id: 'n1', source: { kind: 'ndi', ref: 'AYLMO (td_out_windows)' } } } }
        ])
        expect(document.mappingState.surfaces[0].source).toEqual({ kind: 'ndi', ref: 'AYLMO (td_out_windows)' })
        expect(normalizeMappingSurface(document.mappingState.surfaces[0]).source)
            .toEqual({ kind: 'ndi', ref: 'AYLMO (td_out_windows)' })
    })

    it('is LOST on a build that predates the kind — the mixed-version trap, stated', () => {
        // MAPPING_SOURCE_KINDS is closed, and normalizeMappingSurface rewrites
        // a kind it does not know to the default. So on a rig where the desk
        // has `ndi` and the wall does not, the first write from the old side
        // turns the surface back into a test pattern and keeps only the ref —
        // a name with nothing left to read it. Both machines must be on a
        // build that has the kind. This asserts the mechanism from the outside,
        // with a kind no build has, so it goes on being true.
        //
        // It is also why the dim identification card was added as a REF and
        // not a kind (see above): an unknown ref comes back byte-identical.
        expect(normalizeMappingSurface({ id: 'a', source: { kind: 'ndi-2', ref: 'AYLMO (td_out_windows)' } }).source)
            .toEqual({ kind: 'test', ref: 'AYLMO (td_out_windows)' })
    })

    it('keeps the grid an explicit choice that round-trips untouched', () => {
        const document = applyProjectOps(normalizeProjectDocument({}), [
            { type: 'createMappingSurface', payload: { surface: { id: 'a', source: { kind: 'test', ref: 'grid' } } } }
        ])
        expect(document.mappingState.surfaces[0].source).toEqual({ kind: 'test', ref: 'grid' })
    })
})

describe('which display shows this mapping — output.show', () => {
    // The trap named in the stage plan: normalizeMappingState rebuilt `output`
    // from width and height alone, so the first write from ANY machine
    // stripped `show`, and a stage box that had just been told which screen
    // to use went straight back to guessing. This is the write→read.
    const show = { machine: 'b8592c7f-217a-4f95-8c48-07a4e08524d0', name: 'win', screen: { label: 'projector', index: 1, size: [1920, 1080] } }

    it('survives a setMappingState write and a normalize read, on the ESM twin', () => {
        const written = applyProjectOps(normalizeProjectDocument({}), [
            { type: 'setMappingState', payload: { patch: { output: { width: 1920, height: 1080, show, slate: 'off' } } } }
        ])
        const read = normalizeProjectDocument(JSON.parse(JSON.stringify(written)))
        expect(read.mappingState.output).toEqual({ width: 1920, height: 1080, show, slate: 'off' })
    })

    it('writes nothing for a mapping that never named a display — older documents stay byte-identical', () => {
        expect(normalizeMappingState({ output: { width: 1280, height: 800 } }).output).toEqual({ width: 1280, height: 800 })
        expect(normalizeMappingState({ output: { width: 1280, height: 800, slate: 'auto' } }).output).toEqual({ width: 1280, height: 800 })
    })

    it('takes "all" for every screen of the machine, and drops a show that names no machine', () => {
        expect(normalizeMappingState({ output: { show: { machine: 'm1', screen: 'all' } } }).output.show).toEqual({ machine: 'm1', screen: 'all' })
        expect(normalizeMappingState({ output: { show: { machine: 'm1' } } }).output.show).toEqual({ machine: 'm1', screen: 'all' })
        expect(normalizeMappingState({ output: { show: { machine: '', screen: { label: 'x' } } } }).output.show).toBeUndefined()
        expect(normalizeMappingState({ output: { show: 'projector' } }).output.show).toBeUndefined()
    })

    it('keeps whichever of label, index and size were given, and nothing invented', () => {
        expect(normalizeMappingState({ output: { show: { machine: 'm1', screen: { label: 'HDMI-1' } } } }).output.show.screen)
            .toEqual({ label: 'HDMI-1', index: null, size: null })
        expect(normalizeMappingState({ output: { show: { machine: 'm1', screen: { index: 2, size: [1920.4, 1080] } } } }).output.show.screen)
            .toEqual({ label: '', index: 2, size: [1920, 1080] })
        // A screen object with nothing usable in it is every screen, not a
        // screen called "".
        expect(normalizeMappingState({ output: { show: { machine: 'm1', screen: { size: [0, 1] } } } }).output.show.screen).toBe('all')
    })
})

describe('the cue list\'s loop — mappingState.loop', () => {
    it('round-trips on the ESM twin, and writes nothing when off — older documents stay byte-identical', () => {
        const written = applyProjectOps(normalizeProjectDocument({}), [
            { type: 'setMappingState', payload: { patch: { loop: true } } }
        ])
        expect(normalizeProjectDocument(JSON.parse(JSON.stringify(written))).mappingState.loop).toBe(true)
        expect('loop' in normalizeMappingState({})).toBe(false)
        expect('loop' in normalizeMappingState({ loop: 1 })).toBe(false)
    })
})

describe('the show\'s clock — mappingState.showEpoch', () => {
    it('round-trips on the ESM twin, and writes nothing when unset — older documents stay byte-identical', () => {
        const epoch = Date.UTC(2026, 8, 28, 20, 0, 0)
        const written = applyProjectOps(normalizeProjectDocument({}), [
            { type: 'setMappingState', payload: { patch: { showEpoch: epoch } } }
        ])
        expect(normalizeProjectDocument(JSON.parse(JSON.stringify(written))).mappingState.showEpoch).toBe(epoch)
        expect('showEpoch' in normalizeMappingState({})).toBe(false)
        expect('showEpoch' in normalizeMappingState({ showEpoch: -5 })).toBe(false)
    })
    it('keeps showSource "clock" on the ESM twin (RIG_BUILD.md §15.8); anything else and unset write nothing', () => {
        const written = applyProjectOps(normalizeProjectDocument({}), [
            { type: 'setMappingState', payload: { patch: { showSource: 'clock' } } }
        ])
        expect(normalizeProjectDocument(JSON.parse(JSON.stringify(written))).mappingState.showSource).toBe('clock')
        expect('showSource' in normalizeMappingState({ showSource: 'desk' })).toBe(false)
        expect('showSource' in normalizeMappingState({})).toBe(false)
    })
})

describe('the visuals bank', () => {
    const visualDoc = (extra = {}) => normalizeProjectDocument({ mappingState: extra })
    const create = (doc, visual, index) => applyProjectOps(doc, [{ type: 'createMappingVisual', payload: { visual, index } }])
    const roundTrip = (doc, ops) => applyProjectOps(applyProjectOps(doc, ops), invertProjectOps(doc, ops)).mappingState
    const v = (id, source) => ({ id, name: id, source: source || { kind: 'image', ref: '/a.png' } })


    it('stores effects and opacity on visuals and the composition, bounded', () => {
      const fx = [{ id: ' a ', type: 'blur', on: false, params: { amount: 5, big: 1e9, flag: true, label: 'x'.repeat(40), bad: null, '1no': 3 } }, { type: 'tint' }]
      let d = visualDoc()
      d = applyProjectOps(d, [{ type: 'createMappingVisual', payload: { visual: { id: 'a', effects: fx, opacity: 5 } } }])
      expect(d.mappingState.visuals[0].opacity).toBe(1)
      expect(d.mappingState.visuals[0].effects).toEqual([
        { id: 'a', type: 'blur', on: false, params: { amount: 5, big: 100000, flag: true, label: 'x'.repeat(24) } },
        { id: 'fx1', type: 'tint', on: true, params: {} }
      ])
      const ops = [{ type: 'setMappingVisual', payload: { visualId: 'a', patch: { opacity: 0.5, effects: [{ type: 'mirror' }] } } }]
      const after = applyProjectOps(d, ops)
      expect(after.mappingState.visuals[0].opacity).toBe(0.5)
      expect(after.mappingState.visuals[0].effects).toEqual([{ id: 'fx0', type: 'mirror', on: true, params: {} }])
      expect(applyProjectOps(after, invertProjectOps(d, ops)).mappingState).toEqual(d.mappingState)
      const cops = [{ type: 'setMappingState', payload: { patch: { effects: [{ id: 'c', type: 'glow', params: { k: 2 } }] } } }]
      const comp = applyProjectOps(d, cops)
      expect(comp.mappingState.effects).toEqual([{ id: 'c', type: 'glow', on: true, params: { k: 2 } }])
      expect(applyProjectOps(comp, invertProjectOps(d, cops)).mappingState.effects).toEqual([])
      expect(visualDoc().mappingState.effects).toEqual([])
    })
    it('keeps a safe thumb on visuals, blanks bad schemes, and the inverse restores it', () => {
      const d = create(visualDoc(), { id: 'a' })
      expect(d.mappingState.visuals[0].thumb).toBe('')
      const ops = [{ type: 'setMappingVisual', payload: { visualId: 'a', patch: { thumb: '  /t/a.png ' } } }]
      const after = applyProjectOps(d, ops)
      expect(after.mappingState.visuals[0].thumb).toBe('/t/a.png')
      expect(normalizeMappingVisual(after.mappingState.visuals[0]).thumb).toBe('/t/a.png')
      expect(applyProjectOps(after, invertProjectOps(d, ops)).mappingState).toEqual(d.mappingState)
      const back = applyProjectOps(after, [{ type: 'setMappingVisual', payload: { visualId: 'a', patch: { thumb: 'javascript:alert(1)' } } }])
      expect(back.mappingState.visuals[0].thumb).toBe('')
      const inv = invertProjectOps(after, [{ type: 'setMappingVisual', payload: { visualId: 'a', patch: { thumb: 'x' } } }])
      expect(applyProjectOps(back, inv).mappingState.visuals[0].thumb).toBe('/t/a.png')
      expect(normalizeMappingVisual({ thumb: 'data:image/png;base64,AA' }).thumb).toBe('data:image/png;base64,AA')
      expect(normalizeMappingVisual({ thumb: 5 }).thumb).toBe('')
      expect(normalizeMappingVisual({ thumb: '/' + 'x'.repeat(3000) }).thumb).toHaveLength(2048)
    })
    it('keeps paramSpec and params on visuals, filters bad entries, and the inverse restores them', () => {
      const d = create(visualDoc(), { id: 'a' })
      expect(d.mappingState.visuals[0].paramSpec).toEqual([])
      expect(d.mappingState.visuals[0].params).toEqual({})
      const spec = [
        { key: 'speed', label: ' Speed ', type: 'number', min: 0, max: 2, default: 9 },
        { key: '9bad', type: 'number' },
        { key: 'weird', type: 'nope' },
        { key: 'speed', type: 'toggle' },
        { key: 'mode', type: 'choice', options: [['a', 'A'], ['b'], [5, 'x'], ['bad id', 'y']], default: 'zzz' }
      ]
      const ops = [{ type: 'setMappingVisual', payload: { visualId: 'a', patch: { paramSpec: spec, params: { speed: 1.5, 'x y': 1, on: true, s: 'hi', o: {}, n: NaN } } } }]
      const after = applyProjectOps(d, ops)
      const v = after.mappingState.visuals[0]
      expect(v.paramSpec.map((p) => p.key)).toEqual(['speed', 'mode'])
      expect(v.paramSpec[0]).toEqual({ key: 'speed', label: 'Speed', type: 'number', min: 0, max: 2, step: 0.01, default: 2, options: [] })
      expect(v.paramSpec[1].options).toEqual([['a', 'A'], ['b', 'b']])
      expect(v.paramSpec[1].default).toBe('a')
      expect(v.params).toEqual({ speed: 1.5, on: true, s: 'hi' })
      expect(normalizeMappingVisual(v)).toEqual(v)
      expect(applyProjectOps(after, invertProjectOps(d, ops)).mappingState).toEqual(d.mappingState)
      const many = Array.from({ length: 40 }, (_, i) => ({ key: 'k' + i, type: 'toggle' }))
      expect(normalizeMappingVisual({ paramSpec: many }).paramSpec).toHaveLength(32)
      const opts = Array.from({ length: 20 }, (_, i) => ['o' + i, 'O'])
      expect(normalizeMappingVisual({ paramSpec: [{ key: 'c', type: 'choice', options: opts }] }).paramSpec[0].options).toHaveLength(16)
      const bag = Object.fromEntries(many.map((p) => [p.key, 1]))
      expect(Object.keys(normalizeMappingVisual({ params: bag }).params)).toHaveLength(32)
      expect(normalizeMappingVisual({ params: [1] }).params).toEqual({})
    })
    it('drops invalid effect entries, caps at 16 and makes duplicate ids unique', () => {
      const list = normalizeMappingEffects([null, 'x', 3, [], { type: '9bad' }, { type: 'has space' }, { type: 5 }, { id: 'd', type: 'a' }, { id: 'd', type: 'b' }])
      expect(list.map((e) => e.id)).toEqual(['d', 'd-1'])
      expect(normalizeMappingEffects('nope')).toEqual([])
      expect(normalizeMappingEffects(Array.from({ length: 30 }, () => ({ type: 'a' })))).toHaveLength(16)
      const p = normalizeMappingEffects([{ type: 'a', params: Object.fromEntries(Array.from({ length: 30 }, (_, i) => ['k' + i, i])) }])[0].params
      expect(Object.keys(p)).toHaveLength(16)
      expect(normalizeMappingEffects([{ type: 'a', params: 'x' }])[0].params).toEqual({})
    })

    it('defaults to an empty bank with nothing playing', () => {
        const state = normalizeMappingState({})
        expect(state.visuals).toEqual([])
        expect(state.playing).toBe('')
    })

    it('drops visuals without an id and later duplicates, and names the nameless', () => {
        const state = normalizeMappingState({ visuals: [{ name: 'no id' }, { id: '  a  ' }, { id: 'a', name: 'dupe' }, { id: 'b', name: '   ' }] })
        expect(state.visuals.map((visual) => visual.id)).toEqual(['a', 'b'])
        expect(state.visuals.map((visual) => visual.name)).toEqual(['Visual 1', 'Visual 2'])
    })

    it('bounds id and name to 80 characters and the bank to 200', () => {
        const long = 'x'.repeat(120)
        const one = normalizeMappingState({ visuals: [{ id: long, name: long }] }).visuals[0]
        expect(one.id).toHaveLength(80)
        expect(one.name).toHaveLength(80)
        const many = normalizeMappingState({ visuals: Array.from({ length: 250 }, (_, i) => ({ id: 'v' + i })) })
        expect(many.visuals).toHaveLength(200)
    })

    it('gives a visual the test card by default and refuses the wall and visual kinds', () => {
        const state = normalizeMappingState({ visuals: [{ id: 'a' }, { id: 'b', source: { kind: 'wall' } }, { id: 'c', source: { kind: 'visual', ref: 'a' } }, { id: 'd', source: { kind: 'html', ref: '/x.html' } }] })
        const card = { kind: 'test', ref: 'card' }
        expect(state.visuals.map((visual) => visual.source)).toEqual([card, card, card, { kind: 'html', ref: '/x.html' }])
    })

    it('clears playing when it names no visual', () => {
        expect(normalizeMappingState({ visuals: [{ id: 'a' }], playing: 'a' }).playing).toBe('a')
        expect(normalizeMappingState({ visuals: [{ id: 'a' }], playing: 'gone' }).playing).toBe('')
        expect(normalizeMappingState({ playing: 'a' }).playing).toBe('')
    })

    it('accepts the wall, visual and html source kinds with their refs', () => {
        const surfaces = normalizeMappingState({ surfaces: [
            { id: 'w', source: { kind: 'wall', ref: 'junk' } },
            { id: 'v', source: { kind: 'visual', ref: '  vis  ' } },
            { id: 'l', source: { kind: 'visual', ref: 'y'.repeat(120) } },
            { id: 'h', source: { kind: 'html', ref: ' /uploads/a.html ' } },
            { id: 'u', source: { kind: 'nope', ref: 'q' } }
        ] }).surfaces
        expect(surfaces[0].source).toEqual({ kind: 'wall', ref: '' })
        expect(surfaces[1].source).toEqual({ kind: 'visual', ref: 'vis' })
        expect(surfaces[2].source.ref).toHaveLength(80)
        expect(surfaces[3].source).toEqual({ kind: 'html', ref: '/uploads/a.html' })
        expect(surfaces[4].source.kind).toBe('test')
    })

    it('keeps the new kinds in a cue and clears a wall ref there too', () => {
        const cue = normalizeMappingState({ cues: [{ id: 'c', surfaces: { a: { source: { kind: 'wall', ref: 'junk' } } } }] }).cues[0]
        expect(cue.surfaces.a.source).toEqual({ kind: 'wall', ref: '' })
    })

    describe('input', () => {
        const input = (value) => normalizeMappingSurface({ id: 'a', input: value }).input
        it('is omitted unless it is four finite numbers', () => {
            for (const bad of [undefined, null, 'x', [], [0, 0, 1], [0, 0, 1, 1, 1], [0, 0, 1, NaN], [0, 0, '1', 1], [0, 0, Infinity, 1]]) {
                expect('input' in normalizeMappingSurface({ id: 'a', input: bad })).toBe(false)
            }
        })
        it('keeps a good rectangle and clamps the rest to the wall', () => {
            expect(input([0.25, 0.5, 0.5, 0.25])).toEqual([0.25, 0.5, 0.5, 0.25])
            expect(input([-1, 2, 5, -3])).toEqual([0, 1, 1, 0.001])
            expect(input([0.75, 0.5, 1, 1])).toEqual([0.75, 0.5, 0.25, 0.5])
            expect(input([1, 1, 1, 1])).toEqual([1, 1, 0.001, 0.001])
            expect(input([0.1234567891, 0, 0.1, 0.1])[0]).toBe(0.123457)
        })
        it('is set and removed by setMappingSurface, and undo restores absent and present', () => {
            const base = withSurfaces(['a'])
            const set = [{ type: 'setMappingSurface', payload: { surfaceId: 'a', patch: { input: [0, 0, 0.5, 0.5] } } }]
            const doc = applyProjectOps(base, set)
            expect(doc.mappingState.surfaces[0].input).toEqual([0, 0, 0.5, 0.5])
            expect(applyProjectOps(doc, invertProjectOps(base, set)).mappingState).toEqual(base.mappingState)
            const clear = [{ type: 'setMappingSurface', payload: { surfaceId: 'a', patch: { input: null } } }]
            const cleared = applyProjectOps(doc, clear)
            expect('input' in cleared.mappingState.surfaces[0]).toBe(false)
            expect(applyProjectOps(cleared, invertProjectOps(doc, clear)).mappingState).toEqual(doc.mappingState)
        })
    })

    describe('ops and their inverses', () => {
        it('createMappingVisual appends, inserts at an index, and ignores a taken id', () => {
            let doc = create(visualDoc(), v('a'))
            doc = create(doc, v('b'))
            doc = create(doc, v('c'), 1)
            expect(doc.mappingState.visuals.map((visual) => visual.id)).toEqual(['a', 'c', 'b'])
            expect(create(doc, { ...v('a'), name: 'clobber' }).mappingState.visuals[0].name).toBe('a')
            expect(create(doc, { name: 'idless' }).mappingState).toEqual(doc.mappingState)
        })
        it('createMappingVisual inverts to a delete, and to nothing for a taken id', () => {
            const base = create(visualDoc(), v('a'))
            const ops = [{ type: 'createMappingVisual', payload: { visual: v('b') } }]
            expect(invertProjectOps(base, ops)).toEqual([{ type: 'deleteMappingVisual', payload: { visualId: 'b' } }])
            expect(roundTrip(base, ops)).toEqual(base.mappingState)
            expect(invertProjectOps(base, [{ type: 'createMappingVisual', payload: { visual: v('a') } }])).toEqual([])
        })
        it('setMappingVisual merges name and source, ignores a missing id, and inverts', () => {
            const base = create(visualDoc(), v('a'))
            const ops = [{ type: 'setMappingVisual', payload: { visualId: 'a', patch: { name: 'New', source: { kind: 'video', ref: '/m.mp4' } } } }]
            const after = applyProjectOps(base, ops)
            expect(after.mappingState.visuals[0]).toEqual({ id: 'a', name: 'New', source: { kind: 'video', ref: '/m.mp4' }, opacity: 1, effects: [], thumb: '', paramSpec: [], params: {} })
            expect(roundTrip(base, ops)).toEqual(base.mappingState)
            const miss = [{ type: 'setMappingVisual', payload: { visualId: 'zzz', patch: { name: 'x' } } }]
            expect(applyProjectOps(base, miss).mappingState).toEqual(base.mappingState)
            expect(invertProjectOps(base, miss)).toEqual([])
            const bad = applyProjectOps(base, [{ type: 'setMappingVisual', payload: { visualId: 'a', patch: { source: { kind: 'wall' } } } }])
            expect(bad.mappingState.visuals[0].source).toEqual({ kind: 'test', ref: 'card' })
        })
        it('reorderMappingVisuals keeps unnamed ids at the back and inverts', () => {
            const base = ['a', 'b', 'c'].reduce((doc, id) => create(doc, v(id)), visualDoc())
            const ops = [{ type: 'reorderMappingVisuals', payload: { visualIds: ['c', 'a'] } }]
            expect(applyProjectOps(base, ops).mappingState.visuals.map((visual) => visual.id)).toEqual(['b', 'c', 'a'])
            expect(roundTrip(base, ops)).toEqual(base.mappingState)
        })
        it('deleteMappingVisual removes it, stops it playing and repoints surfaces and cues', () => {
            let doc = ['a', 'b', 'c'].reduce((d, id) => create(d, v(id)), visualDoc())
            doc = applyProjectOps(doc, [
                { type: 'setMappingState', payload: { patch: { playing: 'b' } } },
                { type: 'createMappingSurface', payload: { surface: { id: 's1', source: { kind: 'visual', ref: 'b' } } } },
                { type: 'createMappingSurface', payload: { surface: { id: 's2', source: { kind: 'visual', ref: 'c' } } } },
                { type: 'createMappingCue', payload: { cue: { id: 'q', surfaces: { s1: { source: { kind: 'visual', ref: 'b' } }, s2: { source: { kind: 'visual', ref: 'c' } }, s3: { opacity: 0.5 } } } } }
            ])
            expect(doc.mappingState.playing).toBe('b')
            const ops = [{ type: 'deleteMappingVisual', payload: { visualId: 'b' } }]
            const after = applyProjectOps(doc, ops)
            const m = after.mappingState
            expect(m.visuals.map((visual) => visual.id)).toEqual(['a', 'c'])
            expect(m.playing).toBe('')
            expect(m.surfaces[0].source).toEqual({ kind: 'wall', ref: '' })
            expect(m.surfaces[1].source).toEqual({ kind: 'visual', ref: 'c' })
            expect(m.cues[0].surfaces.s1.source).toEqual({ kind: 'wall', ref: '' })
            expect(m.cues[0].surfaces.s2.source).toEqual({ kind: 'visual', ref: 'c' })
            expect(m.cues[0].surfaces.s3).toEqual({ opacity: 0.5 })
            // Undo puts everything back except the wall: it stays as it is (audit 11-12).
            const undone = applyProjectOps(after, invertProjectOps(doc, ops)).mappingState
            expect(undone.playing).toBe('')
            expect({ ...undone, playing: 'b' }).toEqual(doc.mappingState)
            expect(applyProjectOps(doc, [{ type: 'deleteMappingVisual', payload: { visualId: 'nope' } }]).mappingState).toEqual(doc.mappingState)
        })
        // Audit 11-12 (desk tester D1): delete the clip on the wall, play another,
        // Ctrl+Z put the deleted one back ON THE WALL, and redo blacked the wall.
        it('undoing a delete of the playing clip never takes the wall from what plays now', () => {
            let doc = ['a', 'b'].reduce((d, id) => create(d, v(id)), visualDoc())
            doc = applyProjectOps(doc, [{ type: 'setMappingState', payload: { patch: { playing: 'b' } } }])
            const del = [{ type: 'deleteMappingVisual', payload: { visualId: 'b' } }]
            const undoDel = invertProjectOps(doc, del)
            let now = applyProjectOps(doc, del)
            expect(now.mappingState.playing).toBe('')
            now = applyProjectOps(now, [{ type: 'setMappingState', payload: { patch: { playing: 'a' } } }])
            now = applyProjectOps(now, undoDel)
            expect(now.mappingState.visuals.map((visual) => visual.id)).toEqual(['a', 'b'])
            expect(now.mappingState.playing).toBe('a')
            now = applyProjectOps(now, del)
            expect(now.mappingState.playing).toBe('a')
        })
        it('deleteMappingVisual restores the last visual at the back', () => {
            const doc = ['a', 'b'].reduce((d, id) => create(d, v(id)), visualDoc())
            const ops = [{ type: 'deleteMappingVisual', payload: { visualId: 'b' } }]
            expect(roundTrip(doc, ops)).toEqual(doc.mappingState)
        })
    })

    it('setMappingState cannot replace the bank but can set playing', () => {
        const base = create(visualDoc(), v('a'))
        const ops = [{ type: 'setMappingState', payload: { patch: { visuals: [v('evil')], playing: 'a' } } }]
        const after = applyProjectOps(base, ops)
        expect(after.mappingState.visuals.map((visual) => visual.id)).toEqual(['a'])
        expect(after.mappingState.playing).toBe('a')
        const stop = [{ type: 'setMappingState', payload: { patch: { playing: '' } } }]
        expect(applyProjectOps(after, invertProjectOps(after, stop)).mappingState.playing).toBe('a')
        expect(applyProjectOps(applyProjectOps(base, ops), invertProjectOps(base, ops)).mappingState.playing).toBe('')
    })
})

describe('advanced output fields', () => {
    const norm = (surface = {}) => normalizeMappingSurface({ id: 'a', ...surface })
    const setOp = (patch) => [{ type: 'setMappingSurface', payload: { surfaceId: 'a', patch } }]
    const roundTrip = (patch) => {
        const doc = withSurfaces(['a'])
        const after = applyProjectOps(doc, setOp(patch))
        const back = applyProjectOps(after, invertProjectOps(doc, setOp(patch)))
        return { doc, after, back }
    }

    it('has every default', () => {
        const surface = norm()
        expect(surface.flip).toBe('none')
        expect(surface.isKey).toBe(false)
        expect(surface.blackBg).toBe(true)
        expect([surface.red, surface.green, surface.blue]).toEqual([0, 0, 0])
        expect(surface.softEdge).toEqual({ enabled: false, left: 0, right: 0, top: 0, bottom: 0, power: 2, gamma: 1, luminance: 0.5 })
        expect(surface.inputRotation).toBe(0)
        expect('warp' in surface).toBe(false)
        expect(defaultMappingSurface.softEdge).toEqual(surface.softEdge)
        expect(defaultMappingSurface.blackBg).toBe(true)
    })

    it('clamps and repairs each field', () => {
        expect(norm({ flip: 'hv' }).flip).toBe('hv')
        expect(norm({ flip: 'sideways' }).flip).toBe('none')
        expect(norm({ isKey: 'yes' }).isKey).toBe(false)
        expect(norm({ blackBg: false }).blackBg).toBe(false)
        expect(norm({ blackBg: 'no' }).blackBg).toBe(true)
        const colour = norm({ red: 5, green: -5, blue: 0.123456 })
        expect([colour.red, colour.green, colour.blue]).toEqual([1, -1, 0.1235])
        const soft = norm({ softEdge: { enabled: true, left: 9, right: -1, top: 0.25, bottom: 'x', power: 99, gamma: 0, luminance: 3 } }).softEdge
        expect(soft).toEqual({ enabled: true, left: 0.5, right: 0, top: 0.25, bottom: 0, power: 10, gamma: 0.1, luminance: 1 })
        expect(norm({ softEdge: { power: 0 } }).softEdge.power).toBe(0.1)
        expect(norm({ softEdge: { gamma: 50 } }).softEdge.gamma).toBe(4)
        expect(norm({ softEdge: { left: 0.1 } }).softEdge.power).toBe(2)
        expect(norm({ softEdge: 'nope' }).softEdge).toEqual(defaultMappingSurface.softEdge)
        expect(norm({ inputRotation: 190 }).inputRotation).toBe(-170)
        expect(norm({ inputRotation: -180 }).inputRotation).toBe(180)
        expect(norm({ inputRotation: 180 }).inputRotation).toBe(180)
        expect(norm({ inputRotation: 720 }).inputRotation).toBe(0)
        expect(norm({ inputRotation: 12.34567 }).inputRotation).toBe(12.3457)
        expect(norm({ inputRotation: Infinity }).inputRotation).toBe(0)
    })

    it('regularWarpGrid(2, 1) is 5 columns by 3 rows, row-major, top row first', () => {
        const grid = regularWarpGrid(2, 1)
        expect(grid).toHaveLength(15)
        expect(grid.slice(0, 5)).toEqual([[0, 0], [0.25, 0], [0.5, 0], [0.75, 0], [1, 0]])
        expect(grid.slice(5, 10).map((point) => point[1])).toEqual([0.5, 0.5, 0.5, 0.5, 0.5])
        expect(grid[14]).toEqual([1, 1])
        expect(regularWarpGrid(0, 0)).toEqual([[0, 0], [1, 0], [0, 1], [1, 1]])
    })

    it('is omitted when absent and keeps mode and divisions in range', () => {
        expect('warp' in norm({ warp: 'x' })).toBe(false)
        expect('warp' in norm({ warp: null })).toBe(false)
        const warp = norm({ warp: { mode: 'weird', divisionsX: 9, divisionsY: -3 } }).warp
        expect(warp.mode).toBe('linear')
        expect(warp.divisionsX).toBe(4)
        expect(warp.divisionsY).toBe(0)
        expect(warp.points).toEqual(regularWarpGrid(4, 0))
        expect(norm({ warp: {} }).warp).toEqual({ mode: 'linear', divisionsX: 0, divisionsY: 0, points: regularWarpGrid(0, 0) })
        expect(norm({ warp: { mode: 'perspective' } }).warp.mode).toBe('perspective')
    })

    it('regenerates the whole grid when the length or an entry is wrong', () => {
        const short = norm({ warp: { divisionsX: 1, divisionsY: 1, points: [[0, 0], [0.3, 0.3]] } }).warp
        expect(short.points).toEqual(regularWarpGrid(1, 1))
        const points = regularWarpGrid(1, 1)
        points[4] = [0.4, 'x']
        expect(norm({ warp: { divisionsX: 1, divisionsY: 1, points } }).warp.points).toEqual(regularWarpGrid(1, 1))
        points[4] = [0.4, NaN]
        expect(norm({ warp: { divisionsX: 1, divisionsY: 1, points } }).warp.points).toEqual(regularWarpGrid(1, 1))
    })

    it('forces the four corners, clamps and rounds the rest', () => {
        const points = regularWarpGrid(1, 1)
        points[0] = [0.2, 0.2]
        points[2] = [0.9, 0.9]
        points[6] = [-3, 0.5]
        points[8] = [5, 5]
        points[4] = [0.1234567891, 3]
        const out = norm({ warp: { divisionsX: 1, divisionsY: 1, points } }).warp.points
        expect([out[0], out[2], out[6], out[8]]).toEqual([[0, 0], [1, 0], [0, 1], [1, 1]])
        expect(out[4]).toEqual([0.123457, 2])
        expect(out[1]).toEqual([0.5, 0])
        const edge = points.slice()
        edge[3] = [-3, 7]
        expect(norm({ warp: { divisionsX: 1, divisionsY: 1, points: edge } }).warp.points[3]).toEqual([-1, 2])
    })

    it('sets warp, softEdge and flip through setMappingSurface and inverts them', () => {
        const warp = { mode: 'bezier', divisionsX: 1, divisionsY: 0, points: [[0, 0], [0.5, 0.2], [1, 0], [0, 1], [0.5, 0.8], [1, 1]] }
        const w = roundTrip({ warp })
        expect(w.after.mappingState.surfaces[0].warp).toEqual(warp)
        expect('warp' in w.back.mappingState.surfaces[0]).toBe(false)
        expect(w.back.mappingState).toEqual(w.doc.mappingState)

        const removed = applyProjectOps(w.after, setOp({ warp: null }))
        expect('warp' in removed.mappingState.surfaces[0]).toBe(false)
        const restored = applyProjectOps(removed, invertProjectOps(w.after, setOp({ warp: null })))
        expect(restored.mappingState.surfaces[0].warp).toEqual(warp)

        const edited = applyProjectOps(w.after, setOp({ warp: { mode: 'perspective' } }))
        expect(edited.mappingState.surfaces[0].warp.mode).toBe('perspective')
        const editedBack = applyProjectOps(edited, invertProjectOps(w.after, setOp({ warp: { mode: 'perspective' } })))
        expect(editedBack.mappingState).toEqual(w.after.mappingState)

        const s = roundTrip({ softEdge: { enabled: true, left: 0.2, power: 3 } })
        expect(s.after.mappingState.surfaces[0].softEdge).toEqual({ enabled: true, left: 0.2, right: 0, top: 0, bottom: 0, power: 3, gamma: 1, luminance: 0.5 })
        expect(s.back.mappingState).toEqual(s.doc.mappingState)

        const f = roundTrip({ flip: 'h' })
        expect(f.after.mappingState.surfaces[0].flip).toBe('h')
        expect(f.back.mappingState).toEqual(f.doc.mappingState)
    })

    it('never lets these fields into a cue', () => {
        const cue = normalizeMappingCue({
            id: 'c',
            surfaces: {
                a: {
                    enabled: false, opacity: 0.5, flip: 'h', isKey: true, blackBg: false, red: 1, green: 1, blue: 1, inputRotation: 90,
                    softEdge: { enabled: true }, warp: { mode: 'bezier' }
                }
            }
        })
        expect(cue.surfaces.a).toEqual({ enabled: false, opacity: 0.5 })
    })
})

describe('LFO and tempo — stored, bounded, undoable', () => {
    const doc = () => normalizeProjectDocument({})
    it('keeps an effect lfo bounded, drops bad keys and non-objects, and writes none when empty', () => {
        const [fx] = normalizeMappingEffects([{
            type: 'blur',
            lfo: {
                a: { on: true, wave: 'nope', beats: 0, depth: 2 },
                b: { on: 1, wave: 'saw', beats: 999, depth: -3 },
                c: { wave: 'random', beats: 'x', depth: NaN },
                '1bad': { on: true },
                d: 5
            }
        }])
        expect(fx.lfo).toEqual({
            a: { on: true, wave: 'sine', beats: 0.0625, depth: 1 },
            b: { on: false, wave: 'saw', beats: 64, depth: 0 },
            c: { on: false, wave: 'random', beats: 4, depth: 0.5 }
        })
        expect('lfo' in normalizeMappingEffects([{ type: 'blur' }])[0]).toBe(false)
        expect('lfo' in normalizeMappingEffects([{ type: 'blur', lfo: {} }])[0]).toBe(false)
    })
    it('stores a visual lfo (opacity included) through setMappingVisual, and undo restores the absent state', () => {
        const base = applyProjectOps(doc(), [{ type: 'createMappingVisual', payload: { visual: { id: 'a' } } }])
        expect('lfo' in base.mappingState.visuals[0]).toBe(false)
        const ops = [{ type: 'setMappingVisual', payload: { visualId: 'a', patch: { lfo: { opacity: { on: true, wave: 'tri', beats: 2, depth: 0.3 } } } } }]
        const after = applyProjectOps(base, ops)
        expect(after.mappingState.visuals[0].lfo).toEqual({ opacity: { on: true, wave: 'tri', beats: 2, depth: 0.3 } })
        const undone = applyProjectOps(after, invertProjectOps(base, ops))
        expect('lfo' in undone.mappingState.visuals[0]).toBe(false)
        expect(undone.mappingState).toEqual(base.mappingState)
    })
    it('stores the tempo through setMappingState, bounded; bad bpm writes none; undo removes it', () => {
        const base = doc()
        expect('tempo' in base.mappingState).toBe(false)
        const set = (patch) => [{ type: 'setMappingState', payload: { patch } }]
        const ops = set({ tempo: { bpm: 500, zero: 1234.6 } })
        const after = applyProjectOps(base, ops)
        expect(after.mappingState.tempo).toEqual({ bpm: 300, zero: 1235 })
        expect(normalizeMappingState({ tempo: { bpm: 10 } }).tempo).toEqual({ bpm: 20, zero: 0 })
        expect(normalizeMappingState({ tempo: { bpm: 120.456, zero: -1 } }).tempo).toEqual({ bpm: 120.46, zero: 0 })
        expect('tempo' in applyProjectOps(base, set({ tempo: { bpm: 'x' } })).mappingState).toBe(false)
        const undone = applyProjectOps(after, invertProjectOps(base, ops))
        expect('tempo' in undone.mappingState).toBe(false)
        const second = applyProjectOps(after, set({ tempo: { bpm: 90, zero: 5 } }))
        expect(applyProjectOps(second, invertProjectOps(after, set({ tempo: { bpm: 90, zero: 5 } }))).mappingState.tempo).toEqual({ bpm: 300, zero: 1235 })
    })
})
