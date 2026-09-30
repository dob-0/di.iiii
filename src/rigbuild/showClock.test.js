import { describe, expect, it } from 'vitest'
import { clockFadeOf, showDriver, showOf, showStateAt, showTimeline, showWords } from './showClock.js'
import { bestSample, measureServerOffset, sampleOf } from './serverClock.js'

const EPOCH = Date.UTC(2026, 8, 28, 20, 0, 0)
const cue = (id, look, hold, fade = 0, name) => ({ id, name: name || id, lightLook: `rig-${look}`, hold, fade, surfaces: {} })
const doc = (cues, extra = {}) => ({ mappingState: { cues, showEpoch: EPOCH, ...extra } })

// The Minimal loop's shape: five looks, 60 s one pass.
const LOOP = doc([
    cue('c1', 'blackout-beam', 8, 0, 'One beam'),
    cue('c2', 'slow-sweep', 16, 4, 'Slow sweep'),
    cue('c3', 'red-room', 16, 3, 'Red room'),
    cue('c4', 'white-cathedral', 12, 2, 'White cathedral'),
    cue('c5', 'strobe-hit', 8, 0, 'Strobe hit')
], { loop: true })

describe('showOf — what the document carries', () => {
    it('needs a showEpoch and at least one cue with a rig look', () => {
        expect(showOf({})).toBe(null)
        expect(showOf({ mappingState: { cues: [cue('a', 'x', 5)] } })).toBe(null)
        expect(showOf(doc([{ id: 'a', lightScene: 'scene-1', hold: 5 }]))).toBe(null)
        expect(showOf(doc([cue('a', 'x', 5)])).cues[0]).toEqual({ id: 'a', name: 'a', lookId: 'x', holdMs: 5000, fadeMs: 0 })
    })
    it('drops cues that fire no rig look, keeps the order of the rest', () => {
        const s = showOf(doc([cue('a', 'x', 5), { id: 'm', hold: 3, surfaces: {} }, cue('b', 'y', 5)]))
        expect(s.cues.map((c) => c.lookId)).toEqual(['x', 'y'])
    })
})

describe('the timing math', () => {
    const show = showOf(LOOP)
    it('lays the cues end to end by their holds; one pass is the sum', () => {
        const line = showTimeline(show)
        expect(line.steps.map((s) => s.startMs)).toEqual([0, 8000, 24000, 40000, 52000])
        expect(line.lengthMs).toBe(60000)
        expect(line.loops).toBe(true)
    })
    it('names the cue on at every instant of the first pass, and the time to the next', () => {
        expect(showStateAt(show, EPOCH)).toMatchObject({ index: 0, lookId: 'blackout-beam', nextInMs: 8000, cycle: 0 })
        expect(showStateAt(show, EPOCH + 7999)).toMatchObject({ index: 0, nextInMs: 1 })
        expect(showStateAt(show, EPOCH + 8000)).toMatchObject({ index: 1, lookId: 'slow-sweep', firedAt: EPOCH + 8000, fadeMs: 4000, fromLookId: 'blackout-beam' })
        expect(showStateAt(show, EPOCH + 30000)).toMatchObject({ index: 2, lookId: 'red-room', nextInMs: 10000 })
        expect(showStateAt(show, EPOCH + 59999)).toMatchObject({ index: 4, lookId: 'strobe-hit' })
    })
    it('matches the desk: a cue fades in from the moment it fires, and its hold counts from the same moment', () => {
        const s = showStateAt(show, EPOCH + 9000)
        expect(s.firedAt).toBe(EPOCH + 8000)
        expect(s.nextInMs).toBe(15000) // hold 16 s from 8 s = the next cue at 24 s
    })
})

describe('the loop wrap', () => {
    const show = showOf(LOOP)
    it('comes back to cue 1 after the last, fading from the last look', () => {
        const s = showStateAt(show, EPOCH + 60000)
        expect(s).toMatchObject({ index: 0, lookId: 'blackout-beam', cycle: 1, firedAt: EPOCH + 60000, fromLookId: 'strobe-hit' })
    })
    it('is the same moment on every pass, a day later too', () => {
        const day = 24 * 3600 * 1000 // 1440 passes of 60 s exactly
        const a = showStateAt(show, EPOCH + 33000)
        const b = showStateAt(show, EPOCH + day + 33000)
        expect(b.index).toBe(a.index)
        expect(b.nextInMs).toBe(a.nextInMs)
        expect(b.cycle).toBe(1440)
    })
    it('before the epoch, still counts backwards on the same grid (a clock set earlier than the start)', () => {
        expect(showStateAt(show, EPOCH - 1000)).toMatchObject({ index: 4, cycle: -1 })
    })
    it('without loop, the last cue holds for good', () => {
        const once = showOf({ mappingState: { ...LOOP.mappingState, loop: false } })
        expect(showTimeline(once).loops).toBe(false)
        expect(showStateAt(once, EPOCH + 999999)).toMatchObject({ index: 4, ended: true, nextInMs: null })
    })
    it('a cue that waits for GO (hold 0) ends the timeline there: nobody presses GO on a hosted page', () => {
        const s = showOf(doc([cue('a', 'x', 5), cue('b', 'y', 0), cue('c', 'z', 5)], { loop: true }))
        expect(showTimeline(s).loops).toBe(false)
        expect(showStateAt(s, EPOCH + 60000)).toMatchObject({ lookId: 'y', ended: true, nextInMs: null })
    })
    it('hands the room the fade in the desk\'s own shape', () => {
        expect(clockFadeOf(showStateAt(showOf(LOOP), EPOCH + 8500))).toEqual({ lookId: 'rig-slow-sweep', from: 'rig-blackout-beam', fadeMs: 4000, firedAt: EPOCH + 8000 })
    })
})

describe('precedence — who drives the room', () => {
    const show = showOf(LOOP)
    it('a page\'s own GO first, then the desk, then the clock, then the room as saved', () => {
        expect(showDriver({ explicit: 'x', deskChecked: true, deskPresent: true, show })).toBe('explicit')
        expect(showDriver({ explicit: undefined, deskChecked: true, deskPresent: true, show })).toBe('desk')
        expect(showDriver({ explicit: undefined, deskChecked: true, deskPresent: false, show })).toBe('clock')
        expect(showDriver({ explicit: undefined, deskChecked: true, deskPresent: false, show: null })).toBe('document')
    })
    it('waits for the desk probe before starting the clock, so a local room never snaps from clock to desk', () => {
        expect(showDriver({ explicit: undefined, deskChecked: false, deskPresent: false, show })).toBe('pending')
    })
    it('a desk that is present drives the room even while it is dark', () => {
        expect(showDriver({ explicit: undefined, deskChecked: true, deskPresent: true, show: null })).toBe('desk')
    })
    // RIG_BUILD.md §15.8: a comparison version the desk does not carry plays by its own clock
    it('a document whose show says showSource "clock" plays by its clock even where a desk answers — a page\'s GO still first', () => {
        const own = showOf({ mappingState: { ...LOOP.mappingState, showSource: 'clock' } })
        expect(own.source).toBe('clock')
        expect('source' in show).toBe(false)
        expect(showDriver({ explicit: undefined, deskChecked: true, deskPresent: true, show: own })).toBe('clock')
        expect(showDriver({ explicit: undefined, deskChecked: false, deskPresent: false, show: own })).toBe('clock')
        expect(showDriver({ explicit: 'x', deskChecked: true, deskPresent: true, show: own })).toBe('explicit')
        expect(showOf({ mappingState: { ...LOOP.mappingState, showSource: 'desk' } }).source).toBeUndefined()
    })
})

describe('the show chip line', () => {
    it('says where the show is, in words', () => {
        const show = showOf(LOOP)
        expect(showWords(showStateAt(show, EPOCH + 30000), show)).toBe('3 / 5 · Red room · next in 10 s · loop')
    })
})

describe('the server\'s time (Cristian 1989)', () => {
    it('offset = T + rtt/2 − t1, error = rtt/2', () => {
        expect(sampleOf({ t0: 1000, t1: 1100, serverMs: 5050 })).toEqual({ offset: 4000, error: 50 })
        expect(sampleOf({ t0: 1100, t1: 1000, serverMs: 5050 })).toBe(null)
    })
    it('keeps the sample with the tightest bound', () => {
        expect(bestSample([{ offset: 1, error: 80 }, null, { offset: 2, error: 10 }])).toEqual({ offset: 2, error: 10 })
    })
    it('two viewers whose clocks disagree by 7 s compute the same cue once corrected', async () => {
        const show = showOf(LOOP)
        const server = EPOCH + 30000
        const viewer = async (skew) => {
            let local = server + skew
            const fetchImpl = async () => { local += 40; return { ok: true, json: async () => ({ timestamp: server + 20 }) } }
            const { offset } = await measureServerOffset({ fetchImpl, now: () => local, url: 'x', samples: 1 })
            return showStateAt(show, local + offset)
        }
        const a = await viewer(0)
        const b = await viewer(7000)
        expect(a.index).toBe(b.index)
        expect(Math.abs(a.nextInMs - b.nextInMs)).toBeLessThan(1)
    })
    it('with no answer the offset is 0 and nothing throws', async () => {
        const r = await measureServerOffset({ fetchImpl: async () => { throw new Error('offline') }, url: 'x' })
        expect(r).toEqual({ offset: 0, error: null, measured: false })
    })
})
