import { describe, expect, it } from 'vitest'
import { applyProjectOps, invertProjectOps, normalizeProjectDocument } from './projectSchema.js'

// The show's Perform presets live in the document (decision 2026-09-24): the
// crew following the space gets them, and they travel in the .diiii file.

const preset = (id, extra = {}) => ({
    id,
    name: id,
    windows: [{ id: 'deck', kind: 'deck' }, { id: 'out', kind: 'out' }],
    wide: { deck: [1, 2, 66, 95], out: [68, 2, 31, 44] },
    narrow: { deck: [0, 0, 100, 60] },
    ...extra
})

const strip = (doc) => ({ ...doc, projectMeta: { ...doc.projectMeta, createdAt: 0, updatedAt: 0 } })

describe('performState', () => {
    it('a document from before it existed opens with an empty list — the migration is the default', () => {
        const doc = normalizeProjectDocument({ version: 4, nodes: [] })
        expect(doc.performState).toEqual({ presets: [] })
    })

    it('every preset in the document is the show’s, whatever it claimed', () => {
        const doc = normalizeProjectDocument({ performState: { presets: [preset('show:a', { source: 'mine' })] } })
        expect(doc.performState.presets[0].source).toBe('show')
    })

    it('upsert adds, replaces in place, and delete removes', () => {
        let doc = normalizeProjectDocument({})
        doc = applyProjectOps(doc, [{ type: 'upsertPerformPreset', payload: { preset: preset('show:a') } }])
        doc = applyProjectOps(doc, [{ type: 'upsertPerformPreset', payload: { preset: preset('show:b') } }])
        doc = applyProjectOps(doc, [{ type: 'upsertPerformPreset', payload: { preset: preset('show:a', { name: 'renamed' }) } }])
        expect(doc.performState.presets.map((p) => [p.id, p.name])).toEqual([['show:a', 'renamed'], ['show:b', 'show:b']])
        doc = applyProjectOps(doc, [{ type: 'deletePerformPreset', payload: { presetId: 'show:a' } }])
        expect(doc.performState.presets.map((p) => p.id)).toEqual(['show:b'])
    })

    it('two people giving a preset to the show at once both land (one op per preset, not a list replace)', () => {
        const base = normalizeProjectDocument({})
        const both = applyProjectOps(base, [
            { type: 'upsertPerformPreset', payload: { preset: preset('show:hers') } },
            { type: 'upsertPerformPreset', payload: { preset: preset('show:his') } }
        ])
        expect(both.performState.presets.map((p) => p.id)).toEqual(['show:hers', 'show:his'])
    })

    it('undo puts a deleted preset back where it was, and removes an added one', () => {
        const doc = normalizeProjectDocument({ performState: { presets: [preset('show:a'), preset('show:b'), preset('show:c')] } })
        const ops = [{ type: 'deletePerformPreset', payload: { presetId: 'show:b' } }]
        const after = applyProjectOps(doc, ops)
        const back = applyProjectOps(after, invertProjectOps(doc, ops))
        expect(strip(back).performState).toEqual(strip(doc).performState)

        const addOps = [{ type: 'upsertPerformPreset', payload: { preset: preset('show:new') } }]
        const added = applyProjectOps(doc, addOps)
        expect(applyProjectOps(added, invertProjectOps(doc, addOps)).performState).toEqual(doc.performState)
    })

    it('a broken preset op changes nothing', () => {
        const doc = normalizeProjectDocument({ performState: { presets: [preset('show:a')] } })
        const after = applyProjectOps(doc, [
            { type: 'upsertPerformPreset', payload: { preset: { name: 'no id' } } },
            { type: 'deletePerformPreset', payload: {} }
        ])
        expect(after.performState).toEqual(doc.performState)
    })
})
