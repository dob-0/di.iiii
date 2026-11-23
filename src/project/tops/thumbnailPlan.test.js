import { describe, expect, it } from 'vitest'
import { createThumbnailScheduler } from './thumbnailPlan.js'

const tile = (width = 160) => ({ canvas: { width, height: 90 } })
const everything = () => true

describe('thumbnail scheduler', () => {
    it('draws a small tile at most four times a second', () => {
        const scheduler = createThumbnailScheduler()
        const group = new Map([['a', tile()]])
        let drawn = 0
        for (let ms = 0; ms < 1000; ms += 16) drawn += scheduler.due([group], everything, ms).reduce((n, map) => n + map.size, 0)
        expect(drawn).toBe(4)
    })

    it('draws at most three small tiles on one frame, oldest first, and reaches every tile', () => {
        const scheduler = createThumbnailScheduler()
        const group = new Map(Array.from({ length: 9 }, (_, i) => [`n${i}`, tile()]))
        const first = scheduler.due([group], everything, 0)
        expect(first[0].size).toBe(3)
        const seen = new Set(first[0].keys())
        for (let ms = 16; ms < 250; ms += 16) for (const map of scheduler.due([group], everything, ms)) for (const id of map.keys()) seen.add(id)
        expect(seen.size).toBe(9)
    })

    it('keeps a big canvas at twenty a second and never holds it behind the cap', () => {
        const scheduler = createThumbnailScheduler()
        const small = new Map(Array.from({ length: 6 }, (_, i) => [`s${i}`, tile()]))
        const big = new Map([['master', tile(640)]])
        let bigDraws = 0
        for (let ms = 0; ms < 1000; ms += 16) {
            for (const map of scheduler.due([small, big], everything, ms)) if (map.has('master')) bigDraws += 1
        }
        expect(bigDraws).toBeGreaterThanOrEqual(18)
        expect(bigDraws).toBeLessThanOrEqual(22)
    })

    it('skips nodes the engine has no picture for, and keeps second canvases in their own group', () => {
        const scheduler = createThumbnailScheduler()
        const card = new Map([['a', tile()], ['gone', tile()]])
        const window2 = new Map([['a', tile(640)]])
        const out = scheduler.due([card, window2], (id) => id !== 'gone', 0)
        expect(out).toHaveLength(2)
        expect([...out[0].keys()]).toEqual(['a'])
        expect([...out[1].keys()]).toEqual(['a'])
    })
})
