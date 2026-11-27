import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMediaRack } from './mediaRack.js'

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
