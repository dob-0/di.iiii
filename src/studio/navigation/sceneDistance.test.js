import { describe, expect, it } from 'vitest'
import { centreMedian, isSeeThrough, medianDistance, nextSceneDistance } from './sceneDistance.js'

describe('isSeeThrough: what Blender\'s depth buffer would not hold', () => {
    it('drops no-depth-write, no-colour and faded transparent materials; keeps solid ones', () => {
        expect(isSeeThrough({ transparent: true, opacity: 0.35, depthWrite: false })).toBe(true) // the MOXIR boxes probe-stick-jump hit
        expect(isSeeThrough({ depthWrite: false })).toBe(true)
        expect(isSeeThrough({ colorWrite: false })).toBe(true)
        expect(isSeeThrough({ transparent: true, opacity: 1, depthWrite: true })).toBe(false)
        expect(isSeeThrough({ opacity: 1, depthWrite: true })).toBe(false)
        expect(isSeeThrough([{ depthWrite: false }, { opacity: 1, depthWrite: true }])).toBe(false) // one solid slot counts
    })
})

describe('medianDistance: the typical depth of what the view shows', () => {
    it('ignores empty samples and one near object does not decide it', () => {
        expect(medianDistance(new Float32Array([0, 0, 0]))).toBeNull()
        expect(medianDistance([10, 0, 12, 11])).toBe(11)
        expect(medianDistance([0.8, 20, 21, 22, 23])).toBe(21) // a lamp 0.8 m away in one corner: still the hall
        expect(medianDistance([1, 2, 3, 4])).toBe(2.5)
    })
})

describe('centreMedian: what the centre of the view shows', () => {
    it('the stage in the middle decides, not the hall around it; an empty centre falls back to the whole view', () => {
        const w = 6, h = 3, grid = new Array(w * h).fill(58) // the hall, far
        grid[1 * w + 2] = 15; grid[1 * w + 3] = 15 // the stage, in the middle third
        expect(centreMedian(grid, w, h)).toBe(15)
        const empty = new Array(w * h).fill(0); empty[0] = 40; empty[5] = 42
        expect(centreMedian(empty, w, h)).toBe(41)
    })
})

describe('nextSceneDistance: one run of notches never jumps', () => {
    it('a fresh move takes what is measured, clamped to the controls\' range', () => {
        expect(nextSceneDistance({ measured: 24, min: 0.35, max: 400 })).toBe(24)
        expect(nextSceneDistance({ measured: 0.1, min: 0.35, max: 400 })).toBe(0.35)
        expect(nextSceneDistance({ measured: 900, min: 0.35, max: 400 })).toBe(400)
    })
    it('inside a run the distance changes at most 1.2x per notch: passing a wall ramps up, a lamp entering ramps down', () => {
        expect(nextSceneDistance({ measured: 10, previous: 0.35, consecutive: true })).toBeCloseTo(0.42, 6)
        expect(nextSceneDistance({ measured: 1, previous: 12, consecutive: true })).toBeCloseTo(10, 6)
        expect(nextSceneDistance({ measured: 11, previous: 12, consecutive: true })).toBe(11)
    })
    it('nothing in view keeps the previous distance; nothing at all is null', () => {
        expect(nextSceneDistance({ measured: null, previous: 7 })).toBe(7)
        expect(nextSceneDistance({ measured: null, previous: null })).toBeNull()
    })
    it('a wheel run toward a wall that fills the view slows by Blender\'s ratio and still passes it', () => {
        // camera 6 m from a wall; contact distance 0.35 m: the wall leaves the depth picture inside it, the hall behind is 30 m
        let cam = 0, prev = null; const wall = 6, contact = 0.35, behind = 30; const steps = []
        for (let n = 0; n < 40 && cam < wall + 1; n++) {
            const toWall = wall - cam
            const measured = toWall > contact ? toWall : behind
            const d = nextSceneDistance({ measured, previous: prev, consecutive: prev != null, min: contact, max: 400 })
            const step = d - d / 1.2; steps.push(step); cam += step; prev = Math.max(d / 1.2, contact)
        }
        expect(cam).toBeGreaterThan(wall) // through it
        expect(Math.min(...steps)).toBeGreaterThan(0.05) // never a dead notch
        for (let i = 1; i < steps.length; i++) expect(steps[i] / steps[i - 1]).toBeLessThan(1.2 * 1.2 + 1e-9) // no jump
    })
})
