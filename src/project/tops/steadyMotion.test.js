import { describe, expect, it } from 'vitest'
import { STEADY_H, STEADY_W, greyOf, shiftBetween, steadyState, steadyStep } from './steadyMotion.js'

// A made-up camera picture: a smooth pattern (sums of waves) that can be sampled between pixels, so a
// shift of 2.3 pixels is exact. `ox, oy` = where the content sits (content at x is drawn at x + ox).
const waves = [[0.21, 0.13, 0.4], [0.07, 0.31, 1.3], [0.17, -0.11, 2.1], [0.05, 0.05, 0.7], [0.29, 0.02, 2.9]]
const picture = (ox, oy, light = 0) => {
    const rgba = new Uint8Array(STEADY_W * STEADY_H * 4)
    for (let y = 0; y < STEADY_H; y += 1) {
        for (let x = 0; x < STEADY_W; x += 1) {
            let v = 0
            for (const [fx, fy, ph] of waves) v += Math.sin((x - ox) * fx + (y - oy) * fy + ph)
            const byte = Math.max(0, Math.min(255, Math.round(128 + v * 22 + light * 255)))
            const p = (y * STEADY_W + x) * 4
            rgba[p] = rgba[p + 1] = rgba[p + 2] = byte
            rgba[p + 3] = 255
        }
    }
    return rgba
}
const flat = () => new Uint8Array(STEADY_W * STEADY_H * 4).fill(90)

describe('shiftBetween', () => {
    it('finds a whole and a part-pixel shift', () => {
        const a = greyOf(picture(0, 0)).grey
        const b = greyOf(picture(3, -2)).grey
        const m = shiftBetween(a, b)
        expect(m.dx).toBeCloseTo(3, 0)
        expect(m.dy).toBeCloseTo(-2, 0)
        const c = greyOf(picture(2.4, 1.3)).grey
        const n = shiftBetween(a, c)
        expect(Math.abs(n.dx - 2.4)).toBeLessThan(0.3)
        expect(Math.abs(n.dy - 1.3)).toBeLessThan(0.3)
        expect(n.sure).toBeGreaterThan(0.5)
    })

    it('a light change is not a shift', () => {
        const a = greyOf(picture(0, 0)).grey
        const b = greyOf(picture(0, 0, 0.15)).grey
        const m = shiftBetween(a, b)
        expect(Math.abs(m.dx)).toBeLessThan(0.3)
        expect(Math.abs(m.dy)).toBeLessThan(0.3)
    })

    it('a flat picture has nothing to hold on to', () => {
        const a = greyOf(flat())
        expect(a.spread).toBeLessThan(0.01)
    })
})

describe('steadyStep', () => {
    const params = { smooth: 0.5, zoom: 1.1, reach: 0.06 }

    it('takes most of a hand shake out', () => {
        // The camera shakes around a still point: content jumps back and forth by up to 3 px.
        const state = steadyState()
        let seed = 7
        const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5 }
        let raw = 0
        let left = 0
        let before = null
        for (let i = 0; i < 90; i += 1) {
            const ox = rnd() * 6
            const oy = rnd() * 4
            const [sx, sy] = steadyStep(state, greyOf(picture(ox, oy)), params, i * 33.3)
            // Where the content lands on screen: the shader reads at uv + offset, so content at x shows at x - offset.
            const shownX = ox - sx * STEADY_W
            const shownY = oy - sy * STEADY_H
            if (before && i > 20) {
                raw += Math.hypot(ox - before.ox, oy - before.oy)
                left += Math.hypot(shownX - before.shownX, shownY - before.shownY)
            }
            before = { ox, oy, shownX, shownY }
        }
        // Frame-to-frame jumps on screen: well under half of the raw shake.
        expect(left).toBeLessThan(raw * 0.4)
    })

    it('keeps a slow pan and never moves further than the crop hides', () => {
        const state = steadyState()
        const margin = 0.5 - 0.5 / params.zoom
        let last = [0, 0]
        for (let i = 0; i < 150; i += 1) {
            last = steadyStep(state, greyOf(picture(i * 0.5, 0)), params, i * 33.3)
            expect(Math.abs(last[0])).toBeLessThanOrEqual(Math.min(margin, params.reach) + 1e-9)
        }
        // A steady pan settles to a constant lag (it is followed, not frozen).
        const next = steadyStep(state, greyOf(picture(150 * 0.5, 0)), params, 150 * 33.3)
        expect(Math.abs(next[0] - last[0])).toBeLessThan(0.002)
    })

    it('the same frame again holds the offset; a flat picture drifts back to the middle, never snaps', () => {
        const state = steadyState()
        steadyStep(state, greyOf(picture(0, 0)), params, 0)
        const moved = steadyStep(state, greyOf(picture(2, 0)), params, 33)
        expect(moved[0]).toBeGreaterThan(0)
        expect(steadyStep(state, greyOf(picture(2, 0)), params, 66)).toEqual(moved)
        const dark = steadyStep(state, greyOf(flat()), params, 99)
        expect(dark[0]).toBeGreaterThan(0)
        expect(dark[0]).toBeLessThan(moved[0])
        let later = dark
        for (let i = 0; i < 90; i += 1) later = steadyStep(state, greyOf(i % 2 ? flat() : picture(50, 50, 0.3)), params, 132 + i * 33)
        expect(Math.abs(later[0])).toBeLessThan(0.002)
    })

    it('zoom 1 cannot move the picture at all', () => {
        const state = steadyState()
        steadyStep(state, greyOf(picture(0, 0)), { ...params, zoom: 1 }, 0)
        expect(steadyStep(state, greyOf(picture(3, 2)), { ...params, zoom: 1 }, 33)).toEqual([0, 0])
    })
})
