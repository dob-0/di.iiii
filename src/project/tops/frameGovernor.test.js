import { describe, expect, it } from 'vitest'
import { createGovernor } from './frameGovernor.js'

const drawsIn = (hz, maxFps, seconds = 4) => {
    const g = createGovernor({ maxFps })
    let n = 0
    for (let t = 0; t < seconds * 1000; t += 1000 / hz) if (g.drawDue(t)) n += 1
    return n / seconds
}

describe('frameGovernor', () => {
    it('unlimited by default: every frame draws and every run may start', () => {
        const g = createGovernor()
        for (let t = 0; t < 100; t += 4) { expect(g.drawDue(t)).toBe(true); expect(g.runDue(t)).toBe(true); g.noteRun(t) }
    })

    it('a 30 draws a second cap gives 30 on a 60, 144 and 240 Hz screen', () => {
        expect(drawsIn(60, 30)).toBeCloseTo(30, 0)
        expect(drawsIn(240, 30)).toBeCloseTo(30, 0)
        expect(drawsIn(144, 30)).toBeGreaterThanOrEqual(28)
        expect(drawsIn(144, 30)).toBeLessThanOrEqual(30.5)
    })

    it('a run cap of 15 a second lets a run start every 66 ms, counted from the last run started', () => {
        const g = createGovernor({ runsPerSecond: 15 })
        expect(g.runDue(0)).toBe(true)
        g.noteRun(0)
        expect(g.runDue(30)).toBe(false)
        expect(g.runDue(65)).toBe(true)
        // asking does not use the slot
        expect(g.runDue(30)).toBe(false)
        g.noteRun(70)
        expect(g.runDue(100)).toBe(false)
    })
})
