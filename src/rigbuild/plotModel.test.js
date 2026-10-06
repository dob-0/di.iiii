import { describe, expect, it } from 'vitest'
import { TYPE_LIBRARY } from './types/index.js'
import { plotModel, titleTotals } from './plotModel.js'

const lamp = (id, fixture, x = 0) => ({ id, type: 'spotLight', components: { transform: { position: [x, 5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, light: { color: '#ffffff' }, fixture } })

describe('plotModel', () => {
    const entities = [
        lamp('a', { type: 'up-250bsw', mode: '24ch', index: 1, universe: 1, address: 1, hung: true }),
        lamp('b', { type: 'up-250bsw', mode: '24ch', index: 2, universe: 1, address: 10, hung: true }, 1),
        lamp('c', { type: 'up-q108s' }, 2)
    ]
    const model = plotModel({ entities, library: TYPE_LIBRARY, projectId: 'p', deskFlags: [{ key: 'p:c', code: 'no-room', message: 'no universe had room' }] })

    it('draws a conflict where two lamps claim the same slots, and where the desk refused one', () => {
        expect(model.conflicts.map((l) => l.id).sort()).toEqual(['a', 'b', 'c'])
        expect(model.lamps.find((l) => l.id === 'a').conflicts).toContain('overlap')
        expect(model.lamps.find((l) => l.id === 'c').notes).toContain('no universe had room')
    })

    it('never calls an owed mode a conflict', () => {
        const only = plotModel({ entities: [lamp('c', { type: 'up-q108s' })], library: TYPE_LIBRARY })
        expect(only.lamps[0].flags).toContain('mode-unknown')
        expect(only.conflicts).toEqual([])
    })

    it('puts a lamp on the plan at its mount, not its lens', () => {
        const a = model.lamps.find((l) => l.id === 'a')
        expect(a.at[0]).toBeCloseTo(a.mount[0])
        expect(a.mount[1]).toBeGreaterThan(5)
    })

    it('totals the title block from the sheet', () => {
        const t = titleTotals(model.sheet)
        expect(t.channels).toBe('U1 33')
        expect(t.fixtures).toBe('3 fixtures · 2 patched')
    })

    it('says how many of each type are left to place when the project has a rental list (view C, §11)', () => {
        const withList = [...entities, { id: 'rig-show', type: 'group', components: { rentalList: { items: [{ code: 'UP-250BSW', type: 'up-250bsw', ordered: 12 }] } } }]
        const m = plotModel({ entities: withList, library: TYPE_LIBRARY })
        expect(m.key.find((k) => k.type === 'up-250bsw').rental).toMatchObject({ placed: 2, ordered: 12, left: 10 })
        expect(m.key.find((k) => k.type === 'up-q108s').rental).toBeUndefined()
    })
})
