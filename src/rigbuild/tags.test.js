import { describe, expect, it } from 'vitest'
import { addressWords, flagLines, patchLines, tagOf, tagsInView } from './tags.js'
import { plotModel } from './plotModel.js'
import { TYPE_LIBRARY } from './types/index.js'

const lampEntity = (id, fixture, lens = [0, 6, 0]) => ({
    id, type: 'spotLight', name: id,
    components: { transform: { position: lens, rotation: [0, 0, 0], scale: [1, 1, 1] }, fixture }
})

describe('tagOf — "#36 U2.025", and a conflict on the lamp itself', () => {
    it('writes the fixture number and where its channels start', () => {
        expect(addressWords(2, 25)).toBe('U2.025')
        expect(tagOf({ index: 36, universe: 2, address: 25, flags: [], conflicts: [] })).toMatchObject({ text: '#36 U2.025', conflict: false, patched: true })
    })

    it('marks a conflict with "!" and says an owed mode in words', () => {
        expect(tagOf({ index: 38, universe: 2, address: 49, flags: ['overlap'], conflicts: ['overlap'] }).text).toBe('! #38 U2.049')
        expect(tagOf({ index: null, flags: ['mode-unknown'], conflicts: [] })).toMatchObject({ text: '#— mode owed', owed: true, patched: false })
        expect(tagOf({ index: 4, flags: ['not-patched'], conflicts: [] }).text).toBe('#4 not patched')
    })

    it('reads the same rows the plot and the sheet read — two lamps typed over each other', () => {
        const entities = [
            lampEntity('a', { type: 'up-250bsw', mode: '24ch', index: 1, universe: 2, address: 1, hung: true }),
            lampEntity('b', { type: 'up-250bsw', mode: '24ch', index: 2, universe: 2, address: 10, hung: true }, [1, 6, 0])
        ]
        const model = plotModel({ entities, library: TYPE_LIBRARY })
        const tags = model.lamps.map(tagOf)
        expect(tags.every((t) => t.conflict)).toBe(true)
        expect(tags.map((t) => t.text)).toEqual(['! #1 U2.001', '! #2 U2.010'])
        const lines = Object.fromEntries(patchLines(model.lamps[0]))
        expect(lines.address).toBe('001–024')
        expect(lines.mode).toBe('24ch · 24 ch')
        expect(flagLines(model.lamps[0])[0]).toMatchObject({ conflict: true, text: 'overlap' })
    })
})

describe('tagsInView — only the near ones, plus the aimed and the chosen', () => {
    const lamps = Array.from({ length: 60 }, (_, i) => ({ id: `l${i}`, lens: [0, 3, i] }))
    it('takes the nearest in front, up to the cap, and never one behind', () => {
        const ids = tagsInView({ lamps, eye: [0, 1.6, 10.5], forward: [0, 0, 1], max: 5 })
        expect(ids).toEqual(['l11', 'l12', 'l13', 'l14', 'l15'])
    })

    it('adds the aimed and chosen lamps at any distance', () => {
        const ids = tagsInView({ lamps, eye: [0, 1.6, 0], forward: [0, 0, 1], max: 2, aimed: 'l50', chosen: 'l40' })
        expect(ids).toEqual(['l1', 'l2', 'l40', 'l50'])
    })

    it('leaves out lamps past the radius unless asked to keep them', () => {
        const far = tagsInView({ lamps, eye: [0, 1.6, 0], forward: [0, 0, 1], radius: 3 })
        expect(far).toEqual(['l1', 'l2'])
        expect(tagsInView({ lamps, eye: [0, 1.6, 0], forward: [0, 0, 1], radius: 3, alwaysIds: new Set(['l30']) })).toEqual(['l1', 'l2', 'l30'])
    })
})
