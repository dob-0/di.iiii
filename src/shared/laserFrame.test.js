import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as browser from './laserFrame.js'

const require = createRequire(import.meta.url)
const server = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../shared/laserFrame.cjs'))

describe('the laser frame (shared/laserFrame.cjs and its browser twin)', () => {
    const cases = [
        [[[0, 0, 1, 0, 0], [2, -3, 0.5, 9, -1]], 'clamped into range'],
        [[{ x: 0.5, y: -0.5, r: 0, g: 1, b: 0 }], 'objects read'],
        [[[0, 0, 1], [NaN, 0, 1, 1, 1], 'x', null], 'bad points dropped'],
        [Array.from({ length: 2005 }, () => [0, 0, 0, 0, 0]), 'capped']
    ]
    it.each(cases)('the twins agree: %#, %s', (input) => {
        expect(browser.normaliseFramePoints(input)).toEqual(server.normaliseFramePoints(input))
    })
    it('agrees on the constants', () => {
        expect(browser.FRAME_MAX_POINTS).toBe(server.FRAME_MAX_POINTS)
        expect(browser.ALL_CUBES).toBe(server.ALL_CUBES)
    })
    it('clamps, drops and caps', () => {
        expect(browser.normaliseFramePoints([[2, -3, 0.5, 9, -1]]).points).toEqual([[1, -1, 0.5, 1, 0]])
        expect(browser.normaliseFramePoints([[0, 0, 1], null]).dropped).toBe(2)
        expect(browser.normaliseFramePoints(Array.from({ length: 2005 }, () => [0, 0, 0, 0, 0]))).toMatchObject({ dropped: 5 })
    })
})
