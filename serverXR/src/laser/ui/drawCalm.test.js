// The laser desk's calm drawing rules (ui/drawCalm.js): which tiles play, how often the stage is asked, whether a picture changed.
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const calm = require('./drawCalm.js')

describe('the mode', () => {
    it('calm is the default; only calm and full are modes', () => {
        expect(calm.DEFAULT_MODE).toBe('calm')
        expect(calm.MODES).toEqual(['calm', 'full'])
        for (const odd of [null, undefined, '', 'CALM', 'fast', 7, {}]) expect(calm.normaliseMode(odd)).toBe('calm')
        expect(calm.normaliseMode('calm')).toBe('calm')
        expect(calm.normaliseMode('full')).toBe('full')
    })
})

describe('which tiles play', () => {
    const ids = ['a', 'b', 'c', 'd', 'e']
    const playing = (mode, state) => ids.filter((id) => calm.tilePlays(mode, id, state))
    it('calm: only the tile on the laser, the tile open in Edit and the tile under the pointer', () => {
        expect(playing('calm', { liveId: 'a', selected: 'b', hoverId: 'c' })).toEqual(['a', 'b', 'c'])
        expect(playing('calm', { liveId: 'a' })).toEqual(['a'])
        expect(playing('calm', { selected: 'e' })).toEqual(['e'])
        expect(playing('calm', { hoverId: 'd' })).toEqual(['d'])
    })
    it('calm: nothing plays when nothing is live, open or under the pointer', () => {
        expect(playing('calm', {})).toEqual([])
        expect(playing('calm', { liveId: null, selected: null, hoverId: null })).toEqual([])
        expect(playing('calm')).toEqual([])
    })
    it('calm: one tile that is live and open and hovered is one playing tile', () => {
        expect(playing('calm', { liveId: 'b', selected: 'b', hoverId: 'b' })).toEqual(['b'])
    })
    it('calm: a missing id never plays, even when the state is missing too (null === null must not count)', () => {
        expect(calm.tilePlays('calm', null, { liveId: null })).toBe(false)
        expect(calm.tilePlays('calm', undefined, {})).toBe(false)
    })
    it('full: every tile plays, whatever the state', () => {
        expect(playing('full', {})).toEqual(ids)
        expect(playing('full', { liveId: 'a' })).toEqual(ids)
    })
})

describe('how often the stage is asked', () => {
    it('calm, no cube on and no look open in the Preview: every 500 ms', () => {
        expect(calm.stageIntervalMs({ mode: 'calm', armed: false, previewInUse: false })).toBe(500)
        expect(calm.stageIntervalMs({ mode: 'calm' })).toBe(500)
    })
    it('calm, a cube on: every 80 ms', () => {
        expect(calm.stageIntervalMs({ mode: 'calm', armed: true, previewInUse: false })).toBe(80)
    })
    it('calm, the Preview in use: every 80 ms', () => {
        expect(calm.stageIntervalMs({ mode: 'calm', armed: false, previewInUse: true })).toBe(80)
    })
    it('full: every 80 ms, whatever the state', () => {
        expect(calm.stageIntervalMs({ mode: 'full', armed: false, previewInUse: false })).toBe(80)
        expect(calm.stageIntervalMs({ mode: 'full', armed: true, previewInUse: true })).toBe(80)
    })
})

describe('the rates', () => {
    it('a playing tile draws at most 20 pictures a second; the Preview at most ~30', () => {
        expect(1000 / calm.PLAY_MS).toBeLessThanOrEqual(20)
        expect(1000 / calm.PREVIEW_MS).toBeLessThanOrEqual(31)
        expect(1000 / calm.PREVIEW_MS).toBeGreaterThan(1000 / calm.PLAY_MS)
    })
})

describe('did the picture change', () => {
    const square = () => [[0, 0, 0, 0, 0], [0.5, 0, 1, 0, 0], [0.5, 0.5, 1, 0, 0], [0, 0.5, 0, 1, 0]]
    it('the same points give the same fingerprint, a fresh copy too', () => {
        expect(calm.frameHash(square())).toBe(calm.frameHash(square()))
    })
    it('a moved point, a changed colour, an added point or fewer points change it', () => {
        const base = calm.frameHash(square())
        const moved = square()
        moved[2][0] = 0.51
        const recoloured = square()
        recoloured[1][3] = 0.5
        expect(calm.frameHash(moved)).not.toBe(base)
        expect(calm.frameHash(recoloured)).not.toBe(base)
        expect(calm.frameHash([...square(), [0.1, 0.1, 1, 1, 1]])).not.toBe(base)
        expect(calm.frameHash(square().slice(0, 3))).not.toBe(base)
    })
    it('a move under 1/8192 of the field (far under a pixel) is the same picture', () => {
        const nudged = square()
        nudged[2][0] += 1 / 20000
        expect(calm.frameHash(nudged)).toBe(calm.frameHash(square()))
    })
    it('no points is a picture too: a missing list and an empty one are told apart from a line', () => {
        expect(calm.frameHash(undefined)).toBe(calm.frameHash(null))
        expect(calm.frameHash([])).not.toBe(calm.frameHash(square()))
        expect(Number.isInteger(calm.frameHash(undefined))).toBe(true)
    })
    it('the zone key changes with the keep-in zone', () => {
        expect(calm.zoneKey(null)).toBe('')
        expect(calm.zoneKey({ xMin: -1, xMax: 1, yMin: -1, yMax: 1 })).not.toBe(calm.zoneKey({ xMin: -1, xMax: 1, yMin: -1, yMax: 0.5 }))
    })
})
