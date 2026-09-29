import { describe, expect, it } from 'vitest'
import { lumaStats } from './luma.mjs'
import { pinCue } from './look-probe.mjs'

const image = (w, h, fill) => {
    const data = new Uint8Array(w * h * 4)
    for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
            const [r, g, b] = fill(x, y)
            const i = (y * w + x) * 4
            data[i] = r
            data[i + 1] = g
            data[i + 2] = b
            data[i + 3] = 255
        }
    }
    return data
}

describe('lumaStats', () => {
    it('BT.709 luma weights on the encoded values', () => {
        const white = lumaStats(image(10, 10, () => [255, 255, 255]), 10, 10)
        expect(white.mean).toBe(255)
        const red = lumaStats(image(10, 10, () => [255, 0, 0]), 10, 10)
        expect(red.mean).toBe(54) // 0.2126 * 255
        const green = lumaStats(image(10, 10, () => [0, 255, 0]), 10, 10)
        expect(green.mean).toBe(182) // 0.7152 * 255
    })
    it('measures only rows 20–90 % of the height', () => {
        // Top 20 % white (chrome), the rest black.
        const s = lumaStats(image(10, 100, (x, y) => (y < 20 ? [255, 255, 255] : [0, 0, 0])), 10, 100)
        expect(s.mean).toBe(0)
        expect(s.black).toBe(1)
        expect(s.pixels).toBe(700)
    })
    it('percentiles, black and bright shares', () => {
        // 10 % of pixels bright (250), the rest 8.
        const s = lumaStats(image(10, 100, (x) => (x === 0 ? [250, 250, 250] : [8, 8, 8])), 10, 100)
        expect(s.median).toBe(8)
        expect(s.p99).toBe(250)
        expect(s.max).toBe(250)
        expect(s.bright).toBe(0.1)
        expect(s.black).toBe(0.9)
    })
})

describe('pinCue — the show held on one cue, in the browser\'s copy', () => {
    const doc = { mappingState: { cues: [{ name: 'A', fade: 2, hold: 5 }, { name: 'B', fade: 4, hold: 16 }], loop: false } }
    it('one cue, no fade, held an hour, looping, started a second ago', () => {
        const pinned = pinCue(doc, 1, 1_000_000)
        expect(pinned.mappingState.cues).toEqual([{ name: 'B', fade: 0, hold: 3600 }])
        expect(pinned.mappingState.loop).toBe(true)
        expect(pinned.mappingState.showEpoch).toBe(999_000)
        expect(doc.mappingState.cues).toHaveLength(2)
    })
    it('null when there is no such cue', () => {
        expect(pinCue(doc, 5)).toBeNull()
        expect(pinCue({}, 0)).toBeNull()
    })
})
