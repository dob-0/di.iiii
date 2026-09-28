import { describe, expect, it } from 'vitest'
import { TYPE_LIBRARY } from './types/index.js'
import { plotModel } from './plotModel.js'
import { rentalCounts } from './rental.js'
import { barTitle, patchBars } from './patchBars.js'

const lamp = (id, fixture) => ({ id, type: 'spotLight', components: { transform: { position: [0, 5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, fixture } })
const list = { items: [{ code: 'UP-250BSW', type: 'up-250bsw', ordered: 12 }, { code: 'UP-B380F', type: 'up-b380f', ordered: 1 }, { code: 'UP-PL5403', type: 'up-pl5403', ordered: 50 }] }

describe('patch bars', () => {
    const entities = [
        ...Array.from({ length: 9 }, (_, i) => lamp(`s${i}`, { type: 'up-250bsw', mode: '24ch', index: i + 1, universe: 2, address: 1 + i * 24 })),
        lamp('b1', { type: 'up-b380f', mode: '16ch', index: 20, universe: 1, address: 1 }),
        lamp('b2', { type: 'up-b380f', mode: '16ch', index: 21, universe: 1, address: 10 }),
        lamp('p1', { type: 'up-pl5403' })
    ]
    const model = plotModel({ entities, library: TYPE_LIBRARY })
    const bars = patchBars({ model, rental: rentalCounts({ entities, library: TYPE_LIBRARY, list }) })

    it('draws a bar per universe with its lamps, its top and its make-up', () => {
        expect(bars.universes.map((u) => u.universe)).toEqual([1, 2])
        const u2 = bars.universes[1]
        expect(barTitle(u2)).toBe('U2  1–216 / 512')
        expect(u2.makeup).toBe('250BSW ×9')
    })

    it('reserves what the list still has to place, dashed, after the channels its type uses', () => {
        expect(bars.universes[1].toPlace).toEqual([{ code: 'UP-250BSW', n: 3, from: 217, to: 288, footprint: 24 }])
    })

    it('hatches an overlap and offers it as a conflict; lists an owed mode without inventing its channels', () => {
        const u1 = bars.universes[0]
        expect(u1.segments.every((s) => s.conflict)).toBe(true)
        expect(bars.conflicts.map((c) => c.at).sort()).toEqual(['U1.001', 'U1.010'])
        expect(bars.owed).toEqual([{ code: 'UP-PL5403', type: 'up-pl5403', ordered: 50, placed: 1 }])
    })

    it('offers the move on the lamp the desk flagged, not on the one it overlaps', () => {
        const flagged = patchBars({ model, rental: null, deskFlags: [{ key: 'p:b2', code: 'desk-differs' }], projectId: 'p' })
        expect(flagged.conflicts.map((c) => [c.id, c.move])).toEqual([['b2', true], ['b1', false]])
    })
})
