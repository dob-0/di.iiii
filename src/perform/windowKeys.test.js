import { describe, expect, it } from 'vitest'
import { GRID, tileRects, unitSize } from './presets.js'
import { WINDOW_KEYS, isTypingTarget, nextWindowId, windowKeyAction } from './windowKeys.js'

const press = (key, over = {}, target = document.body) => windowKeyAction({ key, target, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...over })

describe('window keys', () => {
    it('maps the table', () => {
        expect(press('m')).toBe('maximize')
        expect(press('/')).toBe('add')
        expect(press('Escape')).toBe('hide')
        expect(press('A', { shiftKey: true })).toBe('arrange')
        expect(press('`', { ctrlKey: true })).toBe('next')
        expect(press('`', { ctrlKey: true, shiftKey: true })).toBe('prev')
        expect(WINDOW_KEYS.map((row) => row.id).sort()).toEqual(['add', 'arrange', 'hide', 'maximize', 'next', 'prev'])
    })
    it('is silent in an input, a select, a textarea and an editable', () => {
        for (const tag of ['input', 'select', 'textarea']) {
            const el = document.createElement(tag)
            expect(isTypingTarget(el)).toBe(true)
            expect(press('m', {}, el)).toBe(null)
            expect(press('Escape', {}, el)).toBe(null)
            expect(press('A', { shiftKey: true }, el)).toBe(null)
        }
        expect(press('/', {}, { tagName: 'DIV', isContentEditable: true })).toBe(null)
    })
    it('never takes the cue digits, Space, Enter, Blackout or a Ctrl/Meta/Alt chord', () => {
        for (const key of ['1', '5', '9', ' ', 'Enter', 'b', 'B']) expect(press(key)).toBe(null)
        expect(press('m', { ctrlKey: true })).toBe(null)
        expect(press('m', { metaKey: true })).toBe(null)
        expect(press('/', { altKey: true })).toBe(null)
        expect(windowKeyAction({ key: 'm', target: document.body, defaultPrevented: true })).toBe(null)
        expect(windowKeyAction({ key: 'm', target: document.body, repeat: true })).toBe(null)
    })
    it('walks the stack top-down, skipping minimised, and wraps', () => {
        const order = ['a', 'b', 'c'] // c on top
        expect(nextWindowId(order, {}, 'c', 1)).toBe('b')
        expect(nextWindowId(order, { b: true }, 'c', 1)).toBe('a')
        expect(nextWindowId(order, {}, 'a', 1)).toBe('c')
        expect(nextWindowId(order, {}, 'c', -1)).toBe('a')
    })
})

const overlap = (a, b) => a[0] < b[0] + b[2] - 1e-6 && b[0] < a[0] + a[2] - 1e-6 && a[1] < b[1] + b[3] - 1e-6 && b[1] < a[1] + a[3] - 1e-6

describe('tileRects (arrange all)', () => {
    const area = { left: 0, top: 84, width: 1440, height: 816 }
    const narrow = { left: 0, top: 84, width: 390, height: 760 }
    it.each([['wide', area], ['narrow', narrow]])('%s: for 1..%s windows fills the desk with no overlap', (widthClass, box) => {
        const cap = Math.min(16, GRID[widthClass].cols * GRID[widthClass].rows)
        for (let n = 1; n <= cap; n += 1) {
            const ids = Array.from({ length: n }, (_, i) => `w${i}`)
            const rects = Object.values(tileRects(ids, widthClass, box))
            expect(rects).toHaveLength(n)
            const sum = rects.reduce((total, r) => total + (r[2] * r[3]) / 100, 0)
            expect(sum).toBeCloseTo(100, 0) // percent of the desk, within rounding
            rects.forEach((a, i) => rects.slice(i + 1).forEach((b) => expect(overlap(a, b)).toBe(false)))
            rects.forEach((r) => { expect(r[0] + r[2]).toBeLessThanOrEqual(100.05); expect(r[1] + r[3]).toBeLessThanOrEqual(100.05) })
        }
    })
    it('keeps the given order and every block at least one unit', () => {
        const rects = tileRects(['a', 'b', 'c'], 'wide', area)
        expect(Object.keys(rects)).toEqual(['a', 'b', 'c'])
        const unit = unitSize(area, GRID.wide)
        Object.values(rects).forEach((r) => { expect((r[2] / 100) * area.width).toBeGreaterThanOrEqual(unit.width - 1); expect((r[3] / 100) * area.height).toBeGreaterThanOrEqual(unit.height - 1) })
        expect(tileRects([], 'wide', area)).toEqual({})
    })
})
