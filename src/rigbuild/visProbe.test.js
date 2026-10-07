import { afterEach, describe, expect, it, vi } from 'vitest'
import { installVisProbe } from './visProbe.js'

describe('the visualiser room fps reading', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        delete window.__diVis
    })

    it('says nothing until a whole second has been drawn, then counts the last second', () => {
        let t = 0
        vi.spyOn(performance, 'now').mockImplementation(() => t)
        const probe = installVisProbe(true)
        // the room's first frames, still loading: no "room 1 fps"
        for (let i = 0; i < 10; i += 1) { t = i * 50; probe.frame([]) }
        expect(probe.fps()).toBeNull()
        // a full second at 60 fps
        for (let i = 0; i < 60; i += 1) { t = 1000 + i * (1000 / 60); probe.frame([]) }
        expect(probe.fps()).toBeGreaterThanOrEqual(59)
        expect(probe.fps()).toBeLessThanOrEqual(61)
    })

    it('reads 0 when the room stops drawing, not its last good second', () => {
        let t = 0
        vi.spyOn(performance, 'now').mockImplementation(() => t)
        const probe = installVisProbe(true)
        for (let i = 0; i < 120; i += 1) { t = i * (1000 / 60); probe.frame([]) }
        t += 3000
        expect(probe.fps()).toBe(0)
    })
})
