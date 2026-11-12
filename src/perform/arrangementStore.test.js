import { afterEach, describe, expect, it } from 'vitest'
import { arrangementKey, clampRect, clearArrangement, readArrangement, sanitizeArrangement, writeArrangement } from './arrangementStore.js'

const sample = () => ({
    presetId: 'vj-windows',
    widthClass: 'wide',
    windows: [{ id: 'deck', kind: 'deck' }, { id: 'out', kind: 'out' }],
    rects: { deck: [0, 0, 60, 100], out: [60, 0, 40, 50] },
    order: ['out', 'deck'],
    minimized: { out: true },
    restore: {}
})

afterEach(() => window.localStorage.clear())

describe('the remembered Perform arrangement', () => {
    it('is stored per project under one key, and read back the same', () => {
        expect(arrangementKey('lab', 'show')).not.toBe(arrangementKey('lab', 'other'))
        expect(writeArrangement('lab', 'show', sample())).toBe(true)
        expect(Object.keys({ ...window.localStorage })).toEqual([arrangementKey('lab', 'show')])
        expect(readArrangement('lab', 'show')).toMatchObject(sample())
        expect(readArrangement('lab', 'other')).toBe(null)
        clearArrangement('lab', 'show')
        expect(readArrangement('lab', 'show')).toBe(null)
    })

    it('clamps every rectangle into the desk: a place from a bigger screen stays reachable', () => {
        expect(clampRect([90, 95, 50, 50])).toEqual([50, 50, 50, 50])
        expect(clampRect([-30, -5, 0, 0])).toEqual([0, 0, 8.33, 12.5])
        expect(clampRect([0, 0, 400, 400])).toEqual([0, 0, 100, 100])
        expect(clampRect('x')).toBe(null)
        const wild = { ...sample(), v: 1, rects: { deck: [180, 240, 90, 90], out: [-50, -50, 10, 10] } }
        const read = sanitizeArrangement(wild)
        for (const rect of Object.values(read.rects)) {
            const [x, y, w, h] = rect
            expect(x).toBeGreaterThanOrEqual(0)
            expect(y).toBeGreaterThanOrEqual(0)
            expect(x + w).toBeLessThanOrEqual(100.01)
            expect(y + h).toBeLessThanOrEqual(100.01)
        }
    })

    it('reads a corrupt, old or foreign value as nothing', () => {
        const key = arrangementKey('lab', 'show')
        for (const bad of ['{not json', 'null', '[]', '"x"', JSON.stringify({ v: 0, ...sample() }), JSON.stringify({ v: 1 }), JSON.stringify({ v: 1, ...sample(), widthClass: 'huge' }), JSON.stringify({ v: 1, ...sample(), windows: [], rects: {} }), JSON.stringify({ v: 1, ...sample(), rects: {} })]) {
            window.localStorage.setItem(key, bad)
            expect(readArrangement('lab', 'show')).toBe(null)
        }
    })

    it('drops stale ids from order, minimised and restore, and keeps every window in the order', () => {
        const read = sanitizeArrangement({ v: 1, ...sample(), order: ['ghost', 'out'], minimized: { ghost: true, out: true, deck: 'yes' }, restore: { ghost: [0, 0, 1, 1], deck: [5, 5, 50, 50] } })
        expect(read.order).toEqual(['out', 'deck'])
        expect(read.minimized).toEqual({ out: true })
        expect(Object.keys(read.restore)).toEqual(['deck'])
    })

    it('does not throw when the browser refuses storage', () => {
        const real = Object.getOwnPropertyDescriptor(window, 'localStorage')
        Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('denied') } })
        try {
            expect(readArrangement('lab', 'show')).toBe(null)
            expect(writeArrangement('lab', 'show', sample())).toBe(false)
            expect(clearArrangement('lab', 'show')).toBe(false)
        } finally {
            Object.defineProperty(window, 'localStorage', real)
        }
    })
})
