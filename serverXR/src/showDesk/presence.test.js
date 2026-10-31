// The show desk's presence rules (showDesk/ui/presence.js), on their own: no DOM, no fetch. showDesk.test.js has the page.
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const P = require('./ui/presence.js')
const board = require('../touchBoard.js')
const here = path.dirname(fileURLToPath(import.meta.url))

describe('colour and name', () => {
    it('FNV-1a 32 bit: the published test vectors; the slot is its remainder by six; the board carries the same function', () => {
        expect([P.fnv1a(''), P.fnv1a('a'), P.fnv1a('foobar')]).toEqual([0x811c9dc5, 0xe40c292c, 0xbf9cf968])
        const ids = Array.from({ length: 200 }, (_, i) => `b${i.toString(16).padStart(11, '0')}`)
        expect(ids.map(P.fnv1a)).toEqual(ids.map(board.fnv1a))
        expect(new Set(ids.map(P.slotOf))).toEqual(new Set([0, 1, 2, 3, 4, 5]))
        expect(P.slotOf('a1b2c3d4e5f6')).toBe(P.fnv1a('a1b2c3d4e5f6') % 6)
    })
    it('the default name: phone, Mac (one touch point at most), tab for everything else', () => {
        const ua = {
            iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
            android: 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
            androidTablet: 'Mozilla/5.0 (Linux; Android 14; SM-X900) AppleWebKit/537.36 Chrome/120 Safari/537.36',
            mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17 Safari/605.1.15',
            linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
        }
        expect(P.defaultLabel(ua.iphone, 5)).toBe('phone')
        expect(P.defaultLabel(ua.android, 5)).toBe('phone')
        expect(P.defaultLabel(ua.androidTablet, 5)).toBe('tab')
        expect(P.defaultLabel(ua.mac, 0)).toBe('Mac')
        expect(P.defaultLabel(ua.mac, 1)).toBe('Mac')
        expect(P.defaultLabel(ua.mac, 5)).toBe('tab') // an iPad says Macintosh with touch points
        expect(P.defaultLabel(ua.linux, 0)).toBe('tab')
        expect(P.defaultLabel('', 0)).toBe('tab')
    })
    it('a name: NFC, no control or bidi characters, one space between words, 12 code points at most, Armenian kept', () => {
        expect(P.cleanLabel('  Արամ  ')).toBe('Արամ')
        expect(P.cleanLabel('é')).toBe('é') // composed
        expect(P.cleanLabel('a‮b\u0000c‏d\n e')).toBe('abcd e')
        expect(P.cleanLabel('Stage left plus more')).toBe('Stage left p')
        expect(Array.from(P.cleanLabel('😀'.repeat(20)))).toHaveLength(12)
        expect(P.cleanLabel(null)).toBe('')
        expect(P.cleanLabel('   ')).toBe('')
        expect(P.cleanLabel('Stage ‮')).toBe('Stage')
    })
})

describe('the ring fades from the last touch', () => {
    it('full strength to 1.5 s, a straight fade, nothing at 4 s', () => {
        expect([0, 1500, 2750, 4000, 5000].map(P.ringAlpha)).toEqual([1, 1, 0.5, 0, 0])
        expect(P.ringAlpha(3200)).toBeCloseTo(0.32, 5)
        expect([NaN, undefined, 'x', Infinity].map(P.ringAlpha)).toEqual([0, 0, 0, 0])
        expect(P.ringAlpha(-50)).toBe(1) // a clock a little behind: just touched
    })
})

describe('what a request carries', () => {
    const me = { id: 'a1b2c3d4e5f6', label: 'Արամ' }
    it('a write carries the id, the name (percent-encoded, ASCII) and the control; a read of the board no control; another read none at all', () => {
        const w = P.headersFor({ ...me, control: 'lamp:f1', post: true })
        expect(w).toEqual({ 'X-Di-Client': 'a1b2c3d4e5f6', 'X-Di-Label': encodeURIComponent('Արամ'), 'X-Di-Control': 'lamp:f1' })
        for (const v of Object.values(w)) expect(v).toMatch(/^[\x20-\x7e]+$/)
        expect(P.headersFor({ ...me, control: 'lamp:f1', post: false })).toEqual({ 'X-Di-Client': 'a1b2c3d4e5f6', 'X-Di-Label': encodeURIComponent('Արամ') })
    })
    it('nothing anonymous, nothing malformed: no id means no headers; a bad control is left out; a lone surrogate costs the name, not the request', () => {
        expect(P.headersFor({ label: 'x', control: 'a', post: true })).toEqual({})
        expect(P.headersFor({ id: 'has space', post: true })).toEqual({})
        expect(P.headersFor({ id: 'abc', control: 'Not A Key', post: true })).toEqual({ 'X-Di-Client': 'abc' })
        expect(P.headersFor({ id: 'abc', label: '\ud800', post: true })).toEqual({ 'X-Di-Client': 'abc' })
    })
    it('a control key makes an odd id safe the same way everywhere, and every key it makes matches the board\'s pattern', () => {
        expect(P.controlKey('scene', 'warm')).toBe('scene:warm')
        expect(P.controlKey('scene', 'Warm open 1')).toBe('scene:Warm_open_1')
        expect(P.controlKey('blackout')).toBe('blackout')
        expect(P.controlKey('lamp', 'x'.repeat(80))).toBe(`lamp:${'x'.repeat(40)}`)
        for (const k of [P.controlKey('scene', 'é ü/ß'), P.controlKey('live', 'pulseBeats'), P.controlKey('light-master')]) expect(k).toMatch(P.CONTROL)
    })
})

describe('the board\'s answer, on this browser\'s clock', () => {
    const answer = { ok: true, clients: [{ id: 'aa', label: 'phone', slot: 2, seenMs: 300, touchMs: 1200 }, { id: 'bb', label: '', slot: 9, seenMs: 0, touchMs: null }], touches: [{ control: 'lamp:f1', id: 'aa', slot: 2, ageMs: 1200 }] }
    it('ages become start times; a slot out of range falls back to the hash; malformed entries are left out', () => {
        const w = P.mergeWho(answer, 100000)
        expect(w.clients).toEqual([
            { id: 'aa', label: 'phone', slot: 2, seenAt: 99700, touchAt: 98800 },
            { id: 'bb', label: '', slot: P.slotOf('bb'), seenAt: 100000, touchAt: null }
        ])
        expect(w.touches).toEqual([{ control: 'lamp:f1', id: 'aa', slot: 2, at: 98800 }])
        const bad = P.mergeWho({ ok: true, clients: [null, { id: 'has space' }, 7], touches: [{ control: 'NOPE', id: 'aa' }, { control: 'a', id: '!' }] }, 5)
        expect(bad).toEqual({ clients: [], touches: [] })
        expect(P.mergeWho({ ok: false }, 5)).toEqual({ clients: [], touches: [] })
        expect(P.mergeWho(null, 5)).toEqual({ clients: [], touches: [] })
    })
})

describe('what the page shows: rings, frame, legend', () => {
    const self = { id: 'me', name: 'tab' }
    const who = (clients, touches) => ({ clients, touches })
    it('a ring in the colour of the browser that touched the control last, faded by the age; the frame follows the latest touch', () => {
        const w = who([{ id: 'aa', label: 'phone', slot: 2, seenAt: 99000, touchAt: 99500 }], [{ control: 'lamp:f1', id: 'aa', slot: 2, at: 99500 }, { control: 'scene:warm', id: 'aa', slot: 2, at: 96800 }])
        const v = P.compose({ who: w, self, now: 100000 })
        expect(v.rings.get('lamp:f1')).toEqual({ slot: 2, alpha: 1 })
        expect(v.rings.get('scene:warm').alpha).toBeCloseTo(0.32, 2)
        expect(v.driver).toEqual({ slot: 2, alpha: 1 })
        expect(P.compose({ who: w, self, now: 103499 }).rings.has('lamp:f1')).toBe(true) // 3999 ms after the touch: a hair left
        expect(P.compose({ who: w, self, now: 103500 }).rings.size).toBe(0) // 4000 ms: gone
        expect(P.compose({ who: w, self, now: 103500 }).driver).toBeNull()
    })
    it('one colour per browser: two browsers touching get two rings, the same colour on every control each touches; mine is the board\'s slot for me', () => {
        const w = who([{ id: 'aa', label: 'a', slot: 2, seenAt: 99900, touchAt: 99900 }, { id: 'bb', label: 'b', slot: 4, seenAt: 99900, touchAt: 99900 }, { id: 'me', label: 'tab', slot: 5, seenAt: 99900, touchAt: null }],
            [{ control: 'lamp:f1', id: 'aa', slot: 2, at: 99900 }, { control: 'lamp:f2', id: 'bb', slot: 4, at: 99800 }, { control: 'bpm', id: 'aa', slot: 2, at: 99700 }])
        const mine = new Map([['scene:dark', 99950]])
        const v = P.compose({ who: w, mine, self, now: 100000 })
        expect([...v.rings].map(([control, r]) => [control, r.slot]).sort()).toEqual([['bpm', 2], ['lamp:f1', 2], ['lamp:f2', 4], ['scene:dark', 5]])
        expect(v.selfSlot).toBe(5)
        expect(v.driver.slot).toBe(5) // the latest touch is mine
    })
    it('the newest touch of a control wins, mine included; with no board my colour is the hash alone', () => {
        const w = who([], [{ control: 'bpm', id: 'aa', slot: 2, at: 99000 }])
        const v = P.compose({ who: w, mine: new Map([['bpm', 99500]]), self, now: 100000 })
        expect(v.rings.get('bpm').slot).toBe(P.slotOf('me'))
        expect(P.compose({ who: null, mine: new Map(), self, now: 1 }).legend).toEqual([{ id: 'me', slot: P.slotOf('me'), name: 'tab', mine: true, driving: false }])
    })
    it('the legend: browsers seen under 5 s or touched under 4 s ago, in slot order, a repeated name numbered, mine always, the long gone dropped', () => {
        const w = who([
            { id: 'c1', label: 'phone', slot: 4, seenAt: 99000, touchAt: null },
            { id: 'd2', label: 'phone', slot: 1, seenAt: 98000, touchAt: null },
            { id: 'e3', label: 'Mac', slot: 0, seenAt: 90000, touchAt: 97000 }, // not asking, but touched 3 s ago
            { id: 'f4', label: 'old', slot: 3, seenAt: 93000, touchAt: 93500 }, // 7 s and 6.5 s ago: gone
            { id: 'g5', label: '', slot: 3, seenAt: 99500, touchAt: null }
        ], [])
        const v = P.compose({ who: w, self: { id: 'me', name: 'tab' }, now: 100000 })
        expect(v.legend.map((c) => [c.slot, c.name])).toEqual([[0, 'Mac'], [1, 'phone'], [3, 'browser'], [4, 'phone 2'], [P.slotOf('me'), 'tab']].sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1)))
        expect(v.legend.find((c) => c.id === 'e3').driving).toBe(true)
        expect(v.legend.find((c) => c.id === 'me').mine).toBe(true)
        expect(v.legend.some((c) => c.id === 'f4')).toBe(false)
    })
})

describe('this browser\'s id and name', () => {
    const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), m } }
    it('an id of 12 hex characters is made once and kept; the name is kept only when the person set one', () => {
        const storage = memory()
        const first = P.loadSelf({ storage, userAgent: 'Macintosh', touchPoints: 0 })
        expect(first.id).toMatch(/^[0-9a-f]{12}$/)
        expect(first.name).toBe('Mac')
        expect(JSON.parse(storage.m.get('diShowDesk.who.v1'))).toEqual({ id: first.id, label: '' })
        const again = P.loadSelf({ storage, userAgent: 'Macintosh', touchPoints: 0 })
        expect(again.id).toBe(first.id)
        again.label = 'Stage'
        expect(P.saveSelf(storage, again)).toBe(true)
        expect(P.loadSelf({ storage, userAgent: 'iPhone', touchPoints: 5 })).toEqual({ id: first.id, label: 'Stage', name: 'Stage' })
    })
    it('no storage, a broken value or a throwing storage: a fresh id for this page load, never a throw', () => {
        expect(P.loadSelf({ storage: null }).id).toMatch(/^[0-9a-f]{12}$/)
        const bad = memory()
        bad.setItem('diShowDesk.who.v1', '{not json')
        expect(P.loadSelf({ storage: bad }).id).toMatch(/^[0-9a-f]{12}$/)
        const other = memory()
        other.setItem('diShowDesk.who.v1', JSON.stringify({ id: 'has space', label: 5 }))
        expect(P.loadSelf({ storage: other }).id).not.toBe('has space')
        const angry = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
        expect(P.loadSelf({ storage: angry }).id).toMatch(/^[0-9a-f]{12}$/)
        expect(P.saveSelf(angry, { id: 'x' })).toBe(false)
    })
})

describe('?presence=0', () => {
    it('turns presence off; anything else leaves it on', () => {
        expect(P.enabled('?presence=0')).toBe(false)
        expect(P.enabled('?a=1&presence=0')).toBe(false)
        expect([P.enabled(''), P.enabled('?presence=1'), P.enabled('?x=0'), P.enabled(undefined)]).toEqual([true, true, true, true])
    })
    it('the rules are the whole of it: no DOM and no fetch in the file', () => {
        const src = fs.readFileSync(path.join(here, 'ui/presence.js'), 'utf8').replace(/\/\/.*$/gm, '')
        expect(src).not.toMatch(/\bdocument\b|\bfetch\(|XMLHttpRequest|localStorage/)
    })
})
