import { describe, it, expect } from 'vitest'
import { DESK_TOP, WINDOW_GAP, arrangeGrid, fitAll, kindSpec, placeWindow } from './deskLayout.js'

const win = (x, y, width, height) => ({ x, y, width, height })
const overlaps = (a, b) => (
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
)

describe('placeWindow', () => {
    it('puts the first window in the middle of what you are looking at', () => {
        const at = placeWindow([], kindSpec('note'), { x: 0, y: 0, width: 1440, height: 800 })
        expect(at.x).toBeCloseTo(Math.round((1440 - 320) / 2 / 24) * 24, 0)
        expect(at.y).toBeCloseTo(Math.round((800 - 220) / 2 / 24) * 24, 0)
    })

    // A desk where the fifth thing lands on the fourth is a pile, not a desk.
    it('never lands on top of what is already there', () => {
        const viewport = { x: 0, y: 0, width: 1440, height: 800 }
        const spec = kindSpec('note')
        const placed = []
        for (let i = 0; i < 8; i += 1) {
            const at = placeWindow(placed, spec, viewport)
            placed.push({ ...at, width: spec.width, height: spec.height })
        }
        placed.forEach((a, i) => {
            placed.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false))
        })
    })
})

describe('arrangeGrid', () => {
    // Row heights have to be measured before anything is placed. Accumulating
    // them while placing laid row 1 over the bottom of row 0, because row 0's
    // tallest window had not been seen yet.
    it('clears the tallest window in the row above', () => {
        const laid = arrangeGrid([win(0, 0, 640, 420), win(0, 0, 320, 220), win(0, 0, 320, 220)], 1440)
        expect(laid).toHaveLength(3)
        laid.forEach((a, i) => {
            laid.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false))
        })
        // 1440 fits two 640-wide columns, so the third window opens row 1 —
        // and row 1's top must clear the 420-tall room in row 0, not the
        // 220-tall note that happened to be measured last.
        expect(laid[0].y).toBe(DESK_TOP)
        expect(laid[2].y).toBe(DESK_TOP + 420 + WINDOW_GAP)
        expect(laid[2].x).toBe(WINDOW_GAP)
    })

    it('is a way of looking, not a rearrangement — the originals are untouched', () => {
        const windows = [win(900, 700, 320, 220), win(40, 40, 320, 220)]
        const before = JSON.parse(JSON.stringify(windows))
        arrangeGrid(windows, 1440)
        expect(windows).toEqual(before)
    })

    it('has nothing to arrange when the desk is empty', () => {
        expect(arrangeGrid([], 1440)).toEqual([])
    })
})

describe('fitAll', () => {
    it('brings everything into view at once', () => {
        const windows = [win(0, 0, 200, 100), win(800, 600, 200, 100)]
        const offset = fitAll(windows, { width: 1400, height: 900 })
        windows.forEach((w) => {
            expect(w.x + offset.x).toBeGreaterThanOrEqual(0)
            expect(w.y + offset.y).toBeGreaterThanOrEqual(0)
            expect(w.x + offset.x + w.width).toBeLessThanOrEqual(1400)
            expect(w.y + offset.y + w.height).toBeLessThanOrEqual(900)
        })
    })

    it('leaves an empty desk where it is', () => {
        expect(fitAll([], { width: 1400, height: 900 })).toEqual({ x: 0, y: 0 })
    })
})
