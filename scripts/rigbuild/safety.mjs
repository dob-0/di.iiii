// The pure safety geometry the MOXIR checks share (moved out of the tests of PR #772, Emilya,
// audit 2026-10-05, so the build and the tests use ONE copy). Geometry only: no load, no rating,
// no sign-off. A rigger signs the rigging; a laser safety officer signs the lasers.
//
// Hall frame: metres, y up from the floor, z along the hall (+ toward the entry), x across (+ house right).

/** A tie-off must miss a crane cab by at least this much (audit A-02). */
export const TIEOFF_CAB_MARGIN_M = 0.1

/** The hall's crane cabs as axis-aligned boxes, grown by `margin`. */
export const cabBoxes = (hall, margin = TIEOFF_CAB_MARGIN_M) => (hall.geometry?.cranes || []).filter((c) => c.cab).map((c) => ({
    min: [c.cab.x_m[0] - margin, c.cab.y_m[0] - margin, c.z_m + c.cab.dz_m[0] - margin],
    max: [c.cab.x_m[1] + margin, c.cab.y_m[1] + margin, c.z_m + c.cab.dz_m[1] + margin]
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

/** The ids of a built rig's tie-offs that pass through a cab of `hall` (with the margin). */
export const tieoffCabClashes = (rig, hall) => {
    const boxes = cabBoxes(hall)
    return (rig.truss?.rigging?.tieoffs || []).filter((t) => boxes.some((b) => segmentHitsBox(t.from_m, t.to_m, b))).map((t) => t.id)
}

/**
 * How far the segment a→b passes UNDER the lowest cab whose plan footprint (x, z) it crosses:
 * cab bottom − the segment's height there, the smallest over the crossing (sampled every ≤ 5 cm).
 * null when the segment never crosses a cab's footprint.
 */
export const clearUnderCab = (a, b, hall) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    const n = Math.max(20, Math.ceil(len / 0.05))
    let best = null
    for (const c of hall.geometry?.cranes || []) {
        if (!c.cab) continue
        for (let i = 0; i <= n; i += 1) {
            const p = a.map((v, k) => v + (b[k] - v) * (i / n))
            const inPlan = p[0] >= c.cab.x_m[0] && p[0] <= c.cab.x_m[1] && p[2] >= c.z_m + c.cab.dz_m[0] && p[2] <= c.z_m + c.cab.dz_m[1]
            if (inPlan) best = Math.min(best ?? Infinity, c.cab.y_m[0] - p[1])
        }
    }
    return best
}

/** The placed things (`{ id, pos: [x, y, z] }`) that stand outside the hall's walls (audit A-10). */
export const outsideHall = (placed, g) => placed
    .filter(({ pos: [x, , z] }) => z > g.end_wall_inner_y_m || z < g.far_wall_z_m || x < g.walls_x_m[0] || x > g.walls_x_m[1])

/** Where a beam from `from` along `dir` reaches the height `y` (null if it never rises to it). */
export const atHeight = (from, dir, y) => (dir[1] > 1e-6 ? from.map((v, i) => v + dir[i] * ((y - from[1]) / dir[1])) : null)

/** Is the point (x, z) inside a roof lantern's opening (audit A-03)? */
export const inLantern = (p, lanterns) => lanterns.some((l) => p[0] >= l.x_m[0] && p[0] <= l.x_m[1] && p[2] >= l.z_m[0] && p[2] <= l.z_m[1])
