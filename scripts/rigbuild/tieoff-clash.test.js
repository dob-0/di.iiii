// @vitest-environment node
//
// THE TIE-OFF CLASH GUARD (audit A-02, 2026-10-05). The house-right tie-off of the cut ran from the line's
// end to its nave column THROUGH the crane cab (x 8.35-9.3 of the strap inside the cab box): the strap that
// stops the line sliding along its slope would have had to pass through the operator's cab. Nothing checked
// a tie-off against the cranes. This does, for every built crane-hung rig, against the hall it names.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { REPO_ROOT } from '../place/common.mjs'

const RIGS = path.join(REPO_ROOT, 'scripts/place/rigs')
const read = (f) => JSON.parse(fs.readFileSync(path.isAbsolute(f) ? f : path.join(REPO_ROOT, f), 'utf8'))
const rigs = fs.readdirSync(RIGS).filter((f) => /^moxir-2026-10-17-.*\.json$/.test(f) && !f.endsWith('.show.json'))
    .map((file) => ({ file, rig: read(path.join(RIGS, file)) }))
    .filter(({ rig }) => rig.truss?.rigging?.tieoffs?.length)

const MARGIN_M = 0.1

/** The cranes' cabs as axis-aligned boxes, grown by the margin. */
export const cabBoxes = (hall) => (hall.geometry?.cranes || []).filter((c) => c.cab).map((c) => ({
    min: [c.cab.x_m[0] - MARGIN_M, c.cab.y_m[0] - MARGIN_M, c.z_m + c.cab.dz_m[0] - MARGIN_M],
    max: [c.cab.x_m[1] + MARGIN_M, c.cab.y_m[1] + MARGIN_M, c.z_m + c.cab.dz_m[1] + MARGIN_M]
}))

/** Does the segment a→b pass through the box? (slab method) */
export const segmentHitsBox = (a, b, box) => {
    let t0 = 0
    let t1 = 1
    for (let i = 0; i < 3; i += 1) {
        const d = b[i] - a[i]
        if (Math.abs(d) < 1e-12) { if (a[i] < box.min[i] || a[i] > box.max[i]) return false; continue }
        let lo = (box.min[i] - a[i]) / d
        let hi = (box.max[i] - a[i]) / d
        if (lo > hi) [lo, hi] = [hi, lo]
        t0 = Math.max(t0, lo)
        t1 = Math.min(t1, hi)
        if (t0 > t1) return false
    }
    return true
}

describe('tie-offs clear the crane cabs', () => {
    it('finds the rigs with tie-offs (so the guard is not an empty loop)', () => {
        expect(rigs.length).toBeGreaterThan(0)
        expect(rigs.map((r) => r.file)).toContain('moxir-2026-10-17-known-full.json')
    })

    it.each(rigs.map((r) => [r.file, r.rig]))('%s: no tie-off passes through a crane cab of the hall it names', (file, rig) => {
        const boxes = cabBoxes(read(rig.hall))
        expect(boxes.length, `${rig.hall} has no crane cab`).toBeGreaterThan(0)
        const clashes = rig.truss.rigging.tieoffs.filter((t) => boxes.some((b) => segmentHitsBox(t.from_m, t.to_m, b))).map((t) => t.id)
        expect(clashes, file).toEqual([])
    })

    it('can fail: the 5.5 m anchor of 2026-10-04 is caught', () => {
        const box = cabBoxes({ geometry: { cranes: [{ z_m: 4.8, cab: { x_m: [8.35, 10.35], dz_m: [-1, 1], y_m: [5.85, 7.95] } }] } })[0]
        expect(segmentHitsBox([5.55, 6.5, 4.8], [11.6, 5.5, 6], box)).toBe(true)
        expect(segmentHitsBox([5.55, 6.5, 4.8], [11.6, 4.6, 6], box)).toBe(false)
    })
})
