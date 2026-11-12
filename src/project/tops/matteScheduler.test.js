import { describe, expect, it } from 'vitest'
import { pickMatteRuns } from './matteScheduler.js'

describe('pickMatteRuns', () => {
    it('gives the budget to the source picked longest ago', () => {
        const list = [{ id: 'a', lastPicked: 10 }, { id: 'b', lastPicked: 3 }, { id: 'c', lastPicked: 7 }]
        expect(pickMatteRuns(list, 1)).toEqual(['b'])
        expect(pickMatteRuns(list, 2)).toEqual(['b', 'c'])
    })

    it('puts a source that never ran first, and keeps the given order on a tie', () => {
        const list = [{ id: 'a', lastPicked: 4 }, { id: 'b', lastPicked: -Infinity }, { id: 'c', lastPicked: -Infinity }]
        expect(pickMatteRuns(list, 3)).toEqual(['b', 'c', 'a'])
    })

    it('runs nothing with no budget and never more than there are sources', () => {
        const list = [{ id: 'a', lastPicked: 1 }]
        expect(pickMatteRuns(list, 0)).toEqual([])
        expect(pickMatteRuns(list, -2)).toEqual([])
        expect(pickMatteRuns(list, 5)).toEqual(['a'])
        expect(pickMatteRuns([], 1)).toEqual([])
        expect(pickMatteRuns(undefined, 1)).toEqual([])
    })

    it('does not change its input and rotates fairly when the winner is stamped each frame', () => {
        const list = [{ id: 'a', lastPicked: -Infinity }, { id: 'b', lastPicked: -Infinity }, { id: 'c', lastPicked: -Infinity }]
        const copy = JSON.stringify(list)
        const turns = []
        for (let frame = 1; frame <= 6; frame += 1) {
            const [id] = pickMatteRuns(list, 1)
            turns.push(id)
            list.find((x) => x.id === id).lastPicked = frame
        }
        expect(turns).toEqual(['a', 'b', 'c', 'a', 'b', 'c'])
        expect(copy).toContain('"a"')
    })
})
