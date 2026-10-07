// @vitest-environment node
//
// The shared safety geometry (safety.mjs) and the flipped cut's clearance (2026-10-07): since the flip the
// −x end of Known · full is its HIGH end, and versions.mjs read only uEnds[0] for the clearance — right only
// because a hung lamp sat on the low end. These hold that the build reads BOTH ends, the low one first.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { REPO_ROOT } from '../place/common.mjs'
import { clearUnderCab, tieoffCabClashes } from './safety.mjs'

const read = (f) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'))
const CAB_HALL = { geometry: { cranes: [{ z_m: 4.8, cab: { x_m: [8.35, 10.35], dz_m: [-1, 1], y_m: [5.85, 7.95] } }] } }

describe('clearUnderCab', () => {
    it('gives the gap under the cab where the segment crosses its plan, null where it never does', () => {
        expect(clearUnderCab([6, 3.4, 4.8], [11.6, 3.4, 6], CAB_HALL)).toBeCloseTo(2.45, 2)
        expect(clearUnderCab([-6, 6.5, 4.8], [-11.6, 5.5, 6], CAB_HALL)).toBe(null)
    })
    it('can fail: a segment through the cab is negative and a clash', () => {
        expect(clearUnderCab([5.55, 6.5, 4.8], [11.6, 6.5, 4.8], CAB_HALL)).toBeLessThan(0)
        expect(tieoffCabClashes({ truss: { rigging: { tieoffs: [{ id: 'x', from_m: [5.55, 6.5, 4.8], to_m: [11.6, 5.5, 6] }] } } }, CAB_HALL)).toEqual(['x'])
    })
})

describe('Known · full (flipped): the clearance reads both ends, the low one first', () => {
    const t = read('scripts/place/rigs/moxir-2026-10-17-known-full.json').truss
    const lowest = Math.min(...t.ends.map((e) => e.bottom_chord_m))
    it('names the lower end, house right since the flip, and nothing on the line is lower than the lowest', () => {
        expect(t.clearance.low_end.bottom_chord_m).toBe(lowest)
        expect(t.clearance.low_end.side).toBe('house-right')
        expect(t.clearance.lowest_m).toBeLessThanOrEqual(lowest)
        expect(t.clearance.note).toMatch(/house-right/)
    })
    it('keeps the 0.5 m raised-hands margin at the low end, and every tie-off under any cab it crosses', () => {
        expect(t.clearance.low_end.over_raised_hands_m).toBeGreaterThanOrEqual(0.5)
        for (const tie of t.rigging.tieoffs) if (tie.under_cab_m != null) expect(tie.under_cab_m, tie.id).toBeGreaterThan(0.1)
    })
})
