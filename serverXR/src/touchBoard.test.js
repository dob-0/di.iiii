// The show desk's touch board (touchBoard.js): pure, in memory, the clock injected.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createTouchBoard, fnv1a, cleanLabel, MAX_CLIENTS, MAX_TOUCHES, TOUCH_KEEP_MS, CLIENT_KEEP_MS } = require('./touchBoard.js')
const here = path.dirname(fileURLToPath(import.meta.url))

const clock = (start = 1_000_000) => { let t = start; const now = () => t; now.tick = (ms) => { t += ms }; return now }
const hdr = (id, extra = {}) => ({ 'x-di-client': id, ...extra })
const write = (id, control, label) => hdr(id, { 'x-di-control': control, ...(label ? { 'x-di-label': encodeURIComponent(label) } : {}) })

describe('who is on', () => {
    it('nobody is anonymous: no id, a bad id or a bad control makes no entry and never throws', () => {
        const b = createTouchBoard({ now: clock() })
        for (const bad of [undefined, null, {}, hdr(''), hdr('has space'), hdr('x'.repeat(41)), hdr('a/b'), { 'x-di-client': 7 }, { 'x-di-client': ['ok1', 'ok2'] }]) {
            expect(() => b.seen(bad)).not.toThrow()
        }
        expect(b.snapshot().clients.map((c) => c.id)).toEqual(['ok1']) // an array header takes its first value; the rest made nothing
        expect(b.touch(write('abc', 'Not A Key'))).toBe(false)
        expect(b.touch(write('abc', 'lamp:f 1'))).toBe(false)
        expect(b.touch({ 'x-di-control': 'bpm' })).toBe(false)
        expect(b.snapshot().touches).toEqual([])
    })
    it('asking puts a browser on the list; its name is decoded (Armenian round trip), cut to 12 characters, stripped of bidi marks', () => {
        const b = createTouchBoard({ now: clock() })
        b.seen(hdr('aa', { 'x-di-label': encodeURIComponent('Արամ') }))
        b.seen(hdr('bb', { 'x-di-label': encodeURIComponent('Stage left plus more') }))
        b.seen(hdr('cc', { 'x-di-label': encodeURIComponent('ok‮evil') }))
        b.seen(hdr('dd', { 'x-di-label': '%E0%A4%A' })) // a bad escape: no name, no throw
        const names = Object.fromEntries(b.snapshot().clients.map((c) => [c.id, c.label]))
        expect(names).toEqual({ aa: 'Արամ', bb: 'Stage left p', cc: 'okevil', dd: '' })
        expect(cleanLabel(encodeURIComponent('😀'.repeat(20)))).toBe('😀'.repeat(12))
    })
    it('six distinct colours from the hash starts; a seventh shares the one unseen longest; a known browser keeps its colour', () => {
        const now = clock()
        const b = createTouchBoard({ now })
        const ids = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7']
        const slots = []
        for (const id of ids) { b.seen(hdr(id)); now.tick(10); slots.push(b.snapshot().clients.find((c) => c.id === id).slot) }
        expect(new Set(slots.slice(0, 6)).size).toBe(6)
        expect(slots[6]).toBe(slots[0]) // a1 was seen the longest ago
        now.tick(100)
        b.seen(hdr('a3'))
        expect(b.snapshot().clients.find((c) => c.id === 'a3').slot).toBe(slots[2])
    })
    it('a browser starts at its own hash and walks up to the first free colour', () => {
        const b = createTouchBoard({ now: clock() })
        b.seen(hdr('first'))
        const one = b.snapshot().clients[0].slot
        expect(one).toBe(fnv1a('first') % 6)
        b.seen(hdr('second'))
        const two = b.snapshot().clients.find((c) => c.id === 'second').slot
        expect(two).not.toBe(one)
    })
})

describe('what was touched', () => {
    it('a touch is seen + the control; the answer carries ages from the injected clock, never wall-clock times', () => {
        const now = clock(5_000_000)
        const b = createTouchBoard({ now })
        expect(b.touch(write('aa', 'lamp:f1', 'phone'))).toBe(true)
        now.tick(700)
        b.seen(hdr('bb'))
        const s = b.snapshot()
        expect(s.ok).toBe(true)
        const aa = s.clients.find((c) => c.id === 'aa')
        expect(aa).toMatchObject({ label: 'phone', seenMs: 700, touchMs: 700 })
        expect(s.clients.find((c) => c.id === 'bb')).toMatchObject({ seenMs: 0, touchMs: null })
        expect(s.touches).toEqual([{ control: 'lamp:f1', id: 'aa', slot: aa.slot, ageMs: 700 }])
        expect(JSON.stringify(s)).not.toContain('5000000')
    })
    it('the last toucher of a control wins; a touch is kept 6 s; a browser is kept 8 h so its colour holds all night', () => {
        const now = clock()
        const b = createTouchBoard({ now })
        b.touch(write('aa', 'bpm'))
        now.tick(100)
        b.touch(write('bb', 'bpm'))
        expect(b.snapshot().touches.map((t) => [t.control, t.id])).toEqual([['bpm', 'bb']])
        now.tick(TOUCH_KEEP_MS) // exactly 6 s after the last touch: still there
        expect(b.snapshot().touches).toHaveLength(1)
        now.tick(1)
        expect(b.snapshot().touches).toEqual([])
        const slot = b.snapshot().clients.find((c) => c.id === 'aa').slot
        now.tick(CLIENT_KEEP_MS - TOUCH_KEEP_MS - 200)
        expect(b.snapshot().clients.find((c) => c.id === 'aa').slot).toBe(slot)
        now.tick(CLIENT_KEEP_MS)
        expect(b.snapshot().clients).toEqual([])
    })
    it('the caps hold: 12 browsers (the longest unseen goes) and 64 controls (the oldest goes)', () => {
        const now = clock()
        const b = createTouchBoard({ now })
        for (let i = 0; i < MAX_CLIENTS + 3; i++) { b.seen(hdr(`c${i}`)); now.tick(5) }
        const ids = b.snapshot().clients.map((c) => c.id)
        expect(ids).toHaveLength(MAX_CLIENTS)
        expect(ids).not.toContain('c0')
        expect(ids).toContain(`c${MAX_CLIENTS + 2}`)
        const t = createTouchBoard({ now: clock() })
        for (let i = 0; i < MAX_TOUCHES + 5; i++) t.touch(write('aa', `lamp:f${i}`))
        const controls = t.snapshot().touches.map((x) => x.control)
        expect(controls).toHaveLength(MAX_TOUCHES)
        expect(controls).not.toContain('lamp:f0')
        expect(controls).toContain(`lamp:f${MAX_TOUCHES + 4}`)
    })
    it('a touch whose browser was pushed off the roster goes with it', () => {
        const now = clock()
        const b = createTouchBoard({ now })
        b.touch(write('first', 'bpm'))
        for (let i = 0; i < MAX_CLIENTS; i++) { now.tick(5); b.seen(hdr(`n${i}`)) }
        expect(b.snapshot().touches).toEqual([])
    })
    it('the size: a typical answer is small, and the full board stays within a few KB', () => {
        const now = clock()
        const b = createTouchBoard({ now })
        for (const id of ['a1b2c3d4e5f6', 'b2c3d4e5f6a1', 'c3d4e5f6a1b2']) { b.touch(write(id, 'lamp:f1', 'phone')); now.tick(20) }
        expect(JSON.stringify(b.snapshot()).length).toBeLessThan(1024)
        const full = createTouchBoard({ now })
        for (let i = 0; i < MAX_CLIENTS; i++) full.seen(hdr(`browser${i}x`.padEnd(12, '0'), { 'x-di-label': encodeURIComponent('twelve chars') }))
        for (let i = 0; i < MAX_TOUCHES; i++) full.touch(write('browser0x0000', `scene:scene-number-${i}`))
        expect(JSON.stringify(full.snapshot()).length).toBeLessThan(8 * 1024)
    })
})

describe('the file itself', () => {
    it('keeps nothing on disk and says nothing in a log: no fs, no logger, no express', () => {
        const src = fs.readFileSync(path.join(here, 'touchBoard.js'), 'utf8').replace(/\/\/.*$/gm, '')
        expect(src).not.toMatch(/require\(|console\.|logger|writeFile|appendFile/)
    })
})
