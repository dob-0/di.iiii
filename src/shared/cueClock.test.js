import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as browser from './cueClock.js'

const require = createRequire(import.meta.url)
const dir = path.dirname(fileURLToPath(import.meta.url))
const server = require(path.join(dir, '../../shared/cueClock.cjs'))

// Three cues: 2 s fade inside an 8 s hold, then 4 s / 10 s, then 0 / 5 s.
const CUES = [
    { id: 'one', name: 'One', fade: 2, hold: 8, lightLook: 'look-a' },
    { id: 'two', name: 'Two', fade: 4, hold: 10, lightLook: 'look-b' },
    { id: 'three', name: 'Three', fade: 0, hold: 5 }
]
const list = browser.cueListOf(CUES)
const at = (now, extra = {}) => browser.cueClockAt({ list, epoch: 0, now, ...extra })

// The desk's rules walked one millisecond at a time — an independent reference, no shortcuts.
const walk = (cues, loop, now, events = []) => {
    let index = -1
    let firedAt = null
    const pending = [...events]
    for (let t = 0; t <= now; t += 1) {
        if (index >= 0 && cues[index].holdMs > 0 && t - firedAt >= cues[index].holdMs) {
            const next = index + 1 < cues.length ? index + 1 : loop ? 0 : -1
            if (next >= 0) { index = next; firedAt = t }
        }
        while (pending.length && pending[0].at === t) {
            const e = pending.shift()
            if (e.kind === 'go') {
                const next = index < 0 ? 0 : index + 1 < cues.length ? index + 1 : loop ? 0 : -1
                if (next >= 0) { index = next; firedAt = t }
            } else if (e.kind === 'back') { index = Math.max(0, index - 1); firedAt = t }
            else if (e.kind === 'jump') { index = e.index; firedAt = t }
        }
    }
    return { index, firedAt }
}

describe('the cue clock (shared/cueClock.cjs and its browser twin)', () => {
    it('the browser twin is generated from the .cjs, byte for byte', async () => {
        const { buildTwin } = await import('../../scripts/rigbuild/cue-clock-twin.mjs')
        expect(fs.readFileSync(path.join(dir, 'cueClock.js'), 'utf8')).toBe(buildTwin(fs.readFileSync(path.join(dir, '../../shared/cueClock.cjs'), 'utf8')))
    })
    it.each([
        [{ list, epoch: 0, now: 9000 }],
        [{ list, epoch: 0, loop: true, now: 7 * 24 * 3600 * 1000 + 12345 }],
        [{ list, epoch: null, now: 4000, events: [{ at: 1000, kind: 'go' }, { at: 2000, kind: 'go' }, { at: 3000, kind: 'back' }] }]
    ])('the twins agree: %#', (input) => {
        expect(browser.cueClockAt(input)).toEqual(server.cueClockAt(input))
    })
    it('reads a document cue and a desk cue alike, and holds the desk\'s bounds', () => {
        expect(browser.cueListOf([{ id: 'a', lookId: 'x', hold: 99999, fade: -3 }, null, { lightLook: 'y', fade: 90 }])).toEqual([
            { id: 'a', name: 'x', lookId: 'x', fadeMs: 0, holdMs: 3600 * 1000 },
            { id: 'cue-2', name: 'y', lookId: 'y', fadeMs: 60 * 1000, holdMs: 0 }
        ])
    })
})

describe('where the list is', () => {
    it('an empty list is nothing; no epoch and no GO is not started (index -1)', () => {
        expect(browser.cueClockAt({ list: [], now: 0 })).toBeNull()
        expect(browser.cueClockAt({ list, now: 5000 })).toMatchObject({ index: -1, n: 3, started: false, progress: 0, fading: false })
    })
    it('fades and holds from the same moment; progress runs 0 … 1 over the hold', () => {
        expect(at(0)).toMatchObject({ index: 0, lookId: 'look-a', fading: true, progress: 0, nextInMs: 8000 })
        expect(at(1000)).toMatchObject({ index: 0, fading: true, progress: 0.125 })
        expect(at(2000)).toMatchObject({ index: 0, fading: false, progress: 0.25 })
        expect(at(8000)).toMatchObject({ index: 1, firedAt: 8000, from: 0, fading: true, progress: 0 })
        expect(at(13000)).toMatchObject({ index: 1, fading: false, progress: 0.5, nextInMs: 5000 })
    })
    it('a fade longer than its hold sets the length', () => {
        expect(browser.cueProgressAt({ fadeMs: 6000, holdMs: 3000 }, 0, 3000)).toEqual({ progress: 0.5, fading: true, elapsedMs: 3000 })
        expect(browser.cueProgressAt({ fadeMs: 0, holdMs: 0 }, 0, 1)).toMatchObject({ progress: 1, fading: false })
    })
    it('without loop the last cue ends the list; with loop it comes back to the first', () => {
        expect(at(23000)).toMatchObject({ index: 2, ended: true, nextInMs: null, progress: 1 })
        expect(at(23000, { loop: true })).toMatchObject({ index: 0, firedAt: 23000, from: 2, cycle: 1 })
    })
    it('a week of looping costs one pass and lands where a step-by-step walk would', () => {
        const passes = 26296 // 23 s each: 7 days and 0.6 s
        expect(at(passes * 23000 + 9000, { loop: true })).toMatchObject({ index: 1, cycle: passes, firedAt: passes * 23000 + 8000 })
        const { index, progress, fading, nextInMs } = at(9000, { loop: true })
        expect(at(passes * 23000 + 9000, { loop: true })).toMatchObject({ index, progress, fading, nextInMs })
    })
    it('a hold of 0 waits for GO', () => {
        const waits = browser.cueListOf([{ hold: 2 }, { hold: 0 }, { hold: 2 }])
        expect(browser.cueClockAt({ list: waits, epoch: 0, loop: true, now: 60000 })).toMatchObject({ index: 1, waiting: true, nextInMs: null, ended: false })
        const pressed = (now) => browser.cueClockAt({ list: waits, epoch: 0, loop: true, now, events: [{ at: 50000, kind: 'go' }] })
        expect(pressed(51000)).toMatchObject({ index: 2, firedAt: 50000, waiting: false, nextInMs: 1000 })
        expect(pressed(53000)).toMatchObject({ index: 0, firedAt: 52000, cycle: 1 })
        expect(pressed(60000)).toMatchObject({ index: 1, firedAt: 54000, waiting: true })
    })
})

describe('GO, BACK and JUMP', () => {
    it('GO fires the next cue, BACK the one before, JUMP the one named; a press later than now does not count yet', () => {
        const events = [{ at: 1000, kind: 'go' }, { at: 2000, kind: 'go' }, { at: 3000, kind: 'back' }, { at: 4000, kind: 'jump', index: 2 }, { at: 9000, kind: 'go' }]
        const free = (now) => browser.cueClockAt({ list, now, events })
        expect(free(1500)).toMatchObject({ index: 0, firedAt: 1000 })
        expect(free(2500)).toMatchObject({ index: 1, firedAt: 2000, from: 0 })
        expect(free(3500)).toMatchObject({ index: 0, firedAt: 3000, from: 1 })
        expect(free(4500)).toMatchObject({ index: 2, firedAt: 4000 })
        expect(free(8999)).toMatchObject({ index: 2, ended: false })
        expect(free(9000)).toMatchObject({ index: 2, ended: true })
    })
    it('BACK never goes before the first cue; a JUMP to no such cue is ignored', () => {
        expect(browser.cueClockAt({ list, now: 10, events: [{ at: 1, kind: 'back' }, { at: 2, kind: 'back' }] })).toMatchObject({ index: 0, firedAt: 2 })
        expect(browser.cueClockAt({ list, now: 10, events: [{ at: 1, kind: 'go' }, { at: 2, kind: 'jump', index: 7 }, { at: 3, kind: 'jump', index: 1.5 }] })).toMatchObject({ index: 0, firedAt: 1 })
    })
    it('agrees with a millisecond-by-millisecond walk of the desk\'s rules, loop on and off', () => {
        const short = browser.cueListOf([{ hold: 0.05 }, { hold: 0.03, fade: 0.01 }, { hold: 0 }, { hold: 0.02 }])
        let seed = 7
        const rnd = (n) => ((seed = (seed * 16807) % 2147483647) % n)
        for (let trial = 0; trial < 40; trial += 1) {
            const loop = trial % 2 === 0
            const events = []
            let t = 0
            for (let k = 0; k < 6; k += 1) {
                t += 1 + rnd(60)
                const kind = ['go', 'go', 'back', 'jump'][rnd(4)]
                events.push(kind === 'jump' ? { at: t, kind, index: rnd(4) } : { at: t, kind })
            }
            const now = t + rnd(200)
            const s = browser.cueClockAt({ list: short, loop, now, events })
            expect({ index: s.index, firedAt: s.firedAt }).toEqual(walk(short, loop, now, events))
        }
    })
})
