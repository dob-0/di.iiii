import { describe, expect, it } from 'vitest'
import { GRID, framesFromRects, tileRects, widthClassOf } from './presets.js'

// The pixel rectangles of the windows after "Arrange all", the way the desk draws them.
const arrangedFrames = (count, desk) => {
    const strip = 84
    const area = { left: 0, top: strip, width: desk.width, height: desk.height - strip }
    const widthClass = widthClassOf(desk.width)
    const ids = Array.from({ length: count }, (_, i) => `w${i}`)
    const rects = tileRects(ids, widthClass, area)
    return { area, frames: framesFromRects(rects, area, { grid: GRID[widthClass] }), placed: Object.keys(rects).length }
}

const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

describe('Arrange all leaves no window over another and none off the desk', () => {
    for (const desk of [{ width: 1706, height: 922 }, { width: 1280, height: 720 }]) {
        for (const count of [2, 4, 7]) {
            it(`${count} windows on a ${desk.width}x${desk.height} desk`, () => {
                const { area, frames, placed } = arrangedFrames(count, desk)
                const list = Object.values(frames)
                expect(placed).toBe(count)
                expect(list).toHaveLength(count)
                list.forEach((frame, i) => {
                    expect(frame.x).toBeGreaterThanOrEqual(area.left)
                    expect(frame.y).toBeGreaterThanOrEqual(area.top)
                    expect(frame.x + frame.width).toBeLessThanOrEqual(area.left + area.width)
                    expect(frame.y + frame.height).toBeLessThanOrEqual(area.top + area.height)
                    list.slice(i + 1).forEach((other) => expect(overlaps(frame, other)).toBe(false))
                })
            })
        }
    }
})
