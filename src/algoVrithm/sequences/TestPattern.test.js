import { describe, expect, it } from 'vitest'
import { GRID_LIMITS, cellCentre, clearsLane } from './TestPattern.jsx'

// The test pattern surrounds the visitor and its bars stream through the
// standpoint rather than stopping short of it, so the only thing keeping a slab
// out of somebody's head is the lane test. The grid size RE-ROLLS at runtime
// between 24 and 96 cells across the span, which means the lane has to hold for
// every grid the sequence can produce — not just the one that was on screen when
// somebody last looked at it.

const { span, cellsMin, cellsMax, laneHalfWidth } = GRID_LIMITS

/** Every slab the sequence would draw on a grid of `cells`, as inner edges. */
const innerEdges = (cells) => {
    const cellWidth = span / cells
    const edges = []
    for (let cell = 0; cell < cells; cell++) {
        const x = cellCentre(cell, cellWidth)
        if (!clearsLane(x, cellWidth)) continue
        edges.push(Math.abs(x) - cellWidth * 0.5)
    }
    return edges
}

describe('the lane', () => {
    it('holds at every grid size the re-roll can produce', () => {
        for (let cells = cellsMin; cells <= cellsMax; cells++) {
            const closest = Math.min(...innerEdges(cells))
            expect(closest, `grid of ${cells} cells`).toBeGreaterThanOrEqual(laneHalfWidth)
        }
    })

    it('never empties the rank while holding the lane', () => {
        // The lane could be satisfied trivially by drawing nothing. At the
        // chunkiest grid the cells are 1.4m wide, so this is worth asserting:
        // a lane wide enough to swallow most of a coarse rank would leave the
        // visitor in an empty white room.
        for (let cells = cellsMin; cells <= cellsMax; cells++) {
            expect(innerEdges(cells).length, `grid of ${cells} cells`)
                .toBeGreaterThan(cells * 0.8)
        }
    })

    it('keeps bars close enough to be inside rather than in front of', () => {
        // The direction was that the bars come close. If the nearest drawable
        // slab drifts far out, the sequence has quietly become a corridor again.
        for (let cells = cellsMin; cells <= cellsMax; cells++) {
            expect(Math.min(...innerEdges(cells)), `grid of ${cells} cells`)
                .toBeLessThan(laneHalfWidth + span / cellsMin)
        }
    })

    it('measures to the slab edge, not its centre', () => {
        // A 2m-wide cell centred at 1.5m has its inner edge at 0.5m, inside the
        // lane, even though its centre is outside. This is the bug the edge
        // measurement exists to prevent.
        expect(clearsLane(1.5, 2)).toBe(false)
        expect(clearsLane(1.5, 0.2)).toBe(true)
    })

    it('is symmetric — a channel, not a wall on one side', () => {
        const cellWidth = span / 48
        expect(clearsLane(3.2, cellWidth)).toBe(clearsLane(-3.2, cellWidth))
        expect(clearsLane(0.1, cellWidth)).toBe(false)
        expect(clearsLane(-0.1, cellWidth)).toBe(false)
    })
})
