import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMediaRack, MAX_IDLE_PAGES } from './mediaRack.js'

// 2026-11-12, Emily: the desk visuals "lag and not smooth". A page visual
// hands its frames over the frame relay one at a time, each after a 'next'.
// The desk said 'next' only when a frame arrived, which often landed just
// after the page's following animation frame: every other frame was lost (a
// 61 fps page reached the wall at ~28). The desk now also asks on each of its
// own frames, and half a frame later; it stops asking once the visual is gone.
describe('media rack: a page visual is asked for every frame', () => {
    let queue, nextId, sent
    beforeEach(() => {
        vi.useFakeTimers()
        queue = new Map()
        nextId = 0
        sent = []
        vi.stubGlobal('requestAnimationFrame', (cb) => { nextId += 1; queue.set(nextId, cb); return nextId })
        vi.stubGlobal('cancelAnimationFrame', (id) => { queue.delete(id) })
        vi.stubGlobal('MessageChannel', class {
            constructor() {
                this.port1 = { postMessage: (message) => sent.push(message), close: () => {}, onmessage: null }
                this.port2 = {}
            }
        })
    })
    afterEach(() => {
        vi.unstubAllGlobals()
        vi.useRealTimers()
    })
    const desksFrame = () => {
        const due = [...queue.values()]
        queue.clear()
        due.forEach((cb) => cb(0))
        vi.advanceTimersByTime(8)
    }

    it("says 'next' twice a desk frame with no frame arriving, and stops when the visual is let go", () => {
        const rack = createMediaRack()
        const key = 'html|/visual.html|100x100'
        const entry = rack.acquire(key, { kind: 'html', ref: '/visual.html' }, { width: 100, height: 100 })
        entry.iframe.dispatchEvent(new Event('load'))
        for (let i = 0; i < 5; i++) desksFrame()
        expect(sent.filter((message) => message === 'next')).toHaveLength(10)

        rack.release(key)
        vi.advanceTimersByTime(5000) // past KEEP_MS: the entry is disposed
        const before = sent.length
        for (let i = 0; i < 3; i++) desksFrame()
        expect(sent).toHaveLength(before)
        expect(queue.size).toBe(0)
    })
})

// Audit 11-12: switching clips fast kept up to 30 clip pages alive at once
// (+2.3 GB, past Chrome's WebGL context limit). Only MAX_IDLE_PAGES unused
// pages wait for reuse; the oldest goes first.
describe('media rack: unused clip pages are capped', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.stubGlobal('requestAnimationFrame', () => 1)
        vi.stubGlobal('cancelAnimationFrame', () => {})
        vi.stubGlobal('MessageChannel', class { constructor() { this.port1 = { postMessage() {}, close() {}, onmessage: null }; this.port2 = {} } })
    })
    afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

    it(`keeps at most ${MAX_IDLE_PAGES} unused pages, dropping the oldest at once`, () => {
        const dropped = []
        const rack = createMediaRack({ onDispose: (key) => dropped.push(key) })
        const keys = Array.from({ length: 6 }, (_, index) => `html|/clip-${index}.html|100x100`)
        keys.forEach((key, index) => {
            rack.acquire(key, { kind: 'html', ref: `/clip-${index}.html` }, { width: 100, height: 100 })
            vi.advanceTimersByTime(10)
            rack.release(key)
        })
        expect(dropped).toEqual(keys.slice(0, keys.length - MAX_IDLE_PAGES))
        expect(keys.slice(-MAX_IDLE_PAGES).every((key) => rack.entry(key))).toBe(true)
        // and the ones left still go after the usual wait
        vi.advanceTimersByTime(5000)
        expect(keys.every((key) => !rack.entry(key))).toBe(true)
    })

    it('a page taken again before it is dropped is kept and not counted as unused', () => {
        const rack = createMediaRack()
        const keys = Array.from({ length: 4 }, (_, index) => `html|/clip-${index}.html|100x100`)
        keys.forEach((key, index) => rack.acquire(key, { kind: 'html', ref: `/clip-${index}.html` }, { width: 100, height: 100 }))
        rack.release(keys[0]); rack.release(keys[1])
        rack.acquire(keys[0], { kind: 'html', ref: '/clip-0.html' }, { width: 100, height: 100 })
        rack.release(keys[2]); rack.release(keys[3])
        expect(rack.entry(keys[0])).toBeTruthy()
    })
})
