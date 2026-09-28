// THE VENUE ON THE PLOT — the room's own architecture as plan data: walls, the
// column grid, the zones the show uses, what stands on the floor and what hangs
// over it. docs/architecture/RIG_BUILD.md §10 (view B).
//
// A plan is DATA in the document, on the entity that is the venue's model (the
// hall GLB), as `components.venuePlan` — so it travels with the space and every
// view (the plot, a crew's printout) reads the same thing. It is never drawn by
// hand: `venuePlanFromHall` derives it from the hall description that
// scripts/place/hall.py writes (the same numbers the 3D hall is built from), so the
// plan and the model cannot disagree. A venue with no such description has no plan,
// and the plot says so; it never invents walls.
//
// Frame: the room's, metres, seen from above: x to the right, z toward the viewer
// (three.js Y-up; the plot draws -z up the sheet, which is a true plan, not a mirror).
//
//   outline   [[x, z], ...]                the inside face of the walls, a closed ring
//   columns   [[x, z, w, d], ...]          centre and size (w along x, d along z)
//   grid      { x: [{at, label}], z: [{at, label}] }   structural grid lines
//   zones     [{ id, label, rects: [[x0, z0, x1, z1]], note }]
//   solids    [{ id, label, rect, top }]   things standing on the floor (machinery)
//   overhead  [{ id, label, rect?, line?, bottom }]    above the cut: cranes, lanterns
//   openings  [{ id, label, from: [x, z], to: [x, z] }] doors and gates in a wall
//   north     [x, z] a unit vector, when the site says where north is
//   name, source, warning   provenance, printed on the sheet

const r3 = (v) => Math.round(Number(v) * 1000) / 1000
const rect = (xs, zs) => [r3(Math.min(...xs)), r3(Math.min(...zs)), r3(Math.max(...xs)), r3(Math.max(...zs))]
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // no I or O, as drawing practice avoids them

/**
 * The plan of a hall described by scripts/place/hall.py (`hall.json`, version 2:
 * `geometry.walls_x_m`, `rows_x_m`, `column_grid_z_m`, `end_wall_inner_y_m`, ...).
 * @param {object} hall      the hall.json
 * @param {object} [opts]
 * @param {string} [opts.name]     the venue, as the title block says it
 * @param {string} [opts.source]   where the hall.json came from (a path)
 * @param {object} [opts.site]     the site file (…-site-*.json): gives north
 */
export const venuePlanFromHall = (hall, { name = '', source = '', site = null } = {}) => {
    const g = hall?.geometry
    const dims = hall?.dims || {}
    if (!g || !Array.isArray(g.walls_x_m) || !Number.isFinite(g.end_wall_inner_y_m)) {
        throw new Error('not a hall.json from scripts/place/hall.py (no geometry.walls_x_m / end_wall_inner_y_m)')
    }
    const [wx0, wx1] = g.walls_x_m
    const half = g.end_wall_inner_y_m
    const outline = [[wx0, -half], [wx1, -half], [wx1, half], [wx0, half]].map(([x, z]) => [r3(x), r3(z)])

    // Columns: every row (inner rows and the rows in the long walls) at every grid
    // line. The lower shaft is column_w along the row (z) and column_d across it (x).
    const cw = Number(dims.column_w_m) || 0.5
    const cd = Number(dims.column_d_m) || 0.8
    const rows = (g.rows_x_m || []).map(Number).filter(Number.isFinite)
    const zs = (g.column_grid_z_m || []).map(Number).filter(Number.isFinite)
    const columns = []
    for (const x of rows) for (const z of zs) columns.push([r3(x), r3(z), r3(cd), r3(cw)])

    // Grid lines: rows lettered from the left, lines numbered from the entry (+z).
    // A pair of lines closer than 1.5 m (the paired columns at an expansion joint)
    // shares one number, the second primed.
    const gridX = [...rows].sort((a, b) => a - b).map((at, i) => ({ at: r3(at), label: LETTERS[i] || `X${i + 1}` }))
    const byEntry = [...zs].sort((a, b) => b - a)
    const gridZ = []
    let n = 0
    byEntry.forEach((at, i) => {
        const paired = i > 0 && Math.abs(byEntry[i - 1] - at) < 1.5
        if (!paired) n += 1
        gridZ.push({ at: r3(at), label: paired ? `${n}′` : String(n) })
    })

    const zones = []
    for (const [id, zone] of Object.entries(g.zones || {})) {
        if (id.startsWith('_') || !zone?.used) continue
        const rects = [rect(zone.used.x_m, zone.used.z_m)]
        for (const extra of zone.extra || []) if (extra?.x_m && extra?.z_m) rects.push(rect(extra.x_m, extra.z_m))
        zones.push({ id, label: String(zone.label || id), rects, note: zone.clear ? String(zone.clear) : '' })
    }

    const solids = (g.massing || []).filter((m) => m?.x_m && m?.z_m).map((m) => ({
        id: String(m.id), label: String(m.label || m.id), rect: rect(m.x_m, m.z_m),
        top: r3(Math.max(...(m.y_m || [0])))
    }))

    const overhead = []
    for (const [i, l] of (g.lanterns || []).entries()) {
        if (l?.x_m && l?.z_m) overhead.push({ id: `lantern-${i + 1}`, label: 'roof lantern', rect: rect(l.x_m, l.z_m), bottom: r3(g.deck_m ?? g.truss_top_centre_m ?? 0) })
    }
    const railX = Number(g.crane_rail_x_m)
    for (const [i, c] of (g.cranes || []).entries()) {
        if (!Number.isFinite(c?.z_m) || !Number.isFinite(railX)) continue
        overhead.push({ id: `crane-${i + 1}`, label: 'crane bridge', line: [[r3(-railX), r3(c.z_m)], [r3(railX), r3(c.z_m)]], bottom: r3(c.girder_bottom_m ?? 0) })
    }
    if (Number.isFinite(railX)) {
        overhead.push({ id: 'runway-l', label: 'crane runway', line: [[r3(-railX), r3(-half)], [r3(-railX), r3(half)]], bottom: r3(g.runway_bottom_m ?? 0) })
        overhead.push({ id: 'runway-r', label: 'crane runway', line: [[r3(railX), r3(-half)], [r3(railX), r3(half)]], bottom: r3(g.runway_bottom_m ?? 0) })
    }

    const openings = []
    if (g.door?.w_m) openings.push({ id: 'door', label: `door ${g.door.w_m} m`, from: [r3(-g.door.w_m / 2), r3(g.door.z_m)], to: [r3(g.door.w_m / 2), r3(g.door.z_m)] })
    if (g.far_gate?.w_m) openings.push({ id: 'far-gate', label: `gate ${g.far_gate.w_m} m`, from: [r3(-g.far_gate.w_m / 2), r3(g.far_gate.z_m)], to: [r3(g.far_gate.w_m / 2), r3(g.far_gate.z_m)] })

    return {
        name: String(name || hall.what || 'venue').slice(0, 120),
        source: String(source || `scripts/place/hall.py v${hall.version ?? '?'} (${hall.createdAt || 'undated'})`).slice(0, 240),
        warning: String(hall.warning || '').slice(0, 240),
        outline, columns, grid: { x: gridX, z: gridZ }, zones, solids, overhead, openings,
        ...(northFromSite(site) ? { north: northFromSite(site) } : {})
    }
}

/**
 * North in the room frame, from a site file (scripts/place/rigs/*-site-*.json):
 * the building frame's u axis at `u_bearing_deg`, v at `v_bearing_deg`, and the
 * room's x = -u, z = -v (`hall_from_building`). A direction at bearing b is
 * cos(b - bu) u + sin(b - bu) v; north is b = 0.
 */
export const northFromSite = (site) => {
    const bu = Number(site?.u_bearing_deg)
    const bv = Number(site?.v_bearing_deg)
    if (!Number.isFinite(bu) || !Number.isFinite(bv)) return null
    const how = site?.hall_from_building || {}
    const sx = /x\s*=\s*[^-]*-\s*u/.test(String(how.x || '')) ? -1 : 1
    const sz = /z\s*=\s*-/.test(String(how.z || '')) ? -1 : 1
    const a = (-bu * Math.PI) / 180
    const u = Math.cos(a)
    const v = Math.sin(a) * (Math.abs(bv - bu - 90) < 1e-6 ? 1 : -1)
    return [r3(sx * u), r3(sz * v)]
}

/** The venue entity of a document (the first entity carrying a plan) and its plan. */
export const venueOf = (entities = []) => {
    const entity = entities.find((e) => e?.components?.venuePlan && Array.isArray(e.components.venuePlan.outline)) || null
    return { entity, plan: entity ? entity.components.venuePlan : null }
}

/** The plan's extent as [x0, z0, x1, z1], or null. */
export const planExtent = (plan) => {
    if (!plan?.outline?.length) return null
    const xs = plan.outline.map((p) => p[0])
    const zs = plan.outline.map((p) => p[1])
    return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)]
}
