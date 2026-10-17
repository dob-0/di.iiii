// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createPlayhead, playheadOf, showStateOf } = require('./laserPlayhead.js')

describe('the wall\'s playhead (laserPlayhead.js)', () => {
    it('holds what an outside player plays, with its clock shift and blend, until ttl after the last word', () => {
        let t = 1_000_000
        const p = createPlayhead({ now: () => t })
        expect(p.state()).toEqual({ playing: false })
        expect(p.announce({ project: 'show-a', clockShiftMs: 253400, tween: true, cubes: [{ cube: 'cube-1', group: 'g1' }], ttlMs: 5000 })).toEqual({ ok: true, playing: true })
        expect(p.state()).toMatchObject({ playing: true, source: 'outside', project: 'show-a', clockShiftMs: 253400, tween: true, cubes: [{ cube: 'cube-1', group: 'g1' }], expiresAt: t + 5000 })
        t += 5000
        expect(p.state().playing).toBe(true)
        t += 1
        expect(p.state()).toEqual({ playing: false }) // a player that died without a word reads dark
    })

    it('clears on { playing: false } and refuses a body that is not a playhead', () => {
        const p = createPlayhead({ now: () => 0 })
        p.announce({ project: 'x' })
        expect(p.announce({ playing: false })).toEqual({ ok: true, playing: false })
        expect(p.state()).toEqual({ playing: false })
        expect(p.announce({})).toMatchObject({ ok: false, status: 400 })
        expect(p.announce({ project: 'x', clockShiftMs: 'soon' })).toMatchObject({ ok: false, status: 400 })
        expect(p.announce({ project: 'x', clockShiftMs: 2 * 24 * 3600 * 1000 })).toMatchObject({ ok: false, status: 400 })
    })

    it('clamps ttl and scale, keeps tween strictly boolean', () => {
        expect(playheadOf({ project: 'x', ttlMs: 10 ** 9, scale: 99, tween: 'yes' })).toMatchObject({ ttlMs: 30000, scale: 10, tween: false })
        expect(playheadOf({ project: 'x', ttlMs: 1 })).toMatchObject({ ttlMs: 1000, scale: 1, clockShiftMs: 0 })
        expect(playheadOf({ project: 'x', scale: 'fit' }).scale).toBe('fit')
    })

    it('di\'s own player wins over an outside claim; its clock shift is 0', () => {
        expect(showStateOf({ playing: true, project: 'a', tween: false }, { playing: true, project: 'b' })).toMatchObject({ source: 'di', project: 'a', clockShiftMs: 0 })
        expect(showStateOf({ playing: false }, { playing: true, project: 'b', source: 'outside' })).toMatchObject({ project: 'b', source: 'outside' })
        expect(showStateOf({ playing: false }, { playing: false })).toEqual({ playing: false })
    })
})
