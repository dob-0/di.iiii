// POSITIONS — the named places a card is dealt onto. docs/architecture/RIG_BUILD.md §11.2.
//
// A hanging position is a name shared by the lamps on it (§2.4). View C needs more than
// the name: the SLOTS along it, so a card can be dealt evenly and a person can see what
// is filled and what is free. Positions are DERIVED, never drawn by hand, from what the
// document already holds:
//
//   the pieces (§2.3)        truss runs → "truss header" (a clamp every 0.5 m, the
//                            piece catalogue's own slot points); towers → their ladders
//                            and top plates; the decks of a riser → the stage back line,
//                            its flanks and the pit in front of it
//   the venue plan (§10.3)   the column rows either side of the riser's axis → column
//                            bases, column faces, the next rows out, the dance-floor
//                            columns; the solids behind the riser → the backdrop line
//   the zones                which columns count: those along the stage and dance zones
//
// The offsets are the rig script's own (scripts/place/rig-lib.mjs `place`, the MOXIR
// design): a column-base lamp 0.7 m in front of the column's inner face, an uplight
// 0.45 m off a face, a backdrop lamp 0.35 m off the machine, a tower's side arm on its
// audience face. They are rules of placement, stated here once, not measurements.
//
// A slot is { id, pos: [x, y, z] (the MOUNT, §2.3), hung, side (-1 left of the axis, 1
// right, 0 on it), rank (order from the stage, or along the line) }. Pure.

import { piecesOf, trussRuns } from './plotGeometry.js'
import { venueOf } from './venuePlan.js'
import { TRUSS_SECTION_M, SLOT_PITCH_M } from './pieces.js'

const r3 = (v) => Math.round(v * 1000) / 1000
const PITCH = 0.5
const range = (a, b, step = PITCH) => {
    const out = []
    for (let v = a; v <= b + 1e-9; v += step) out.push(r3(v))
    return out
}
const sideOf = (x, axis) => (Math.abs(x - axis) < 0.05 ? 0 : Math.sign(x - axis))

// The offsets of the rig's own placement rules (rig-lib.mjs `place`), in metres.
export const OFFSETS = Object.freeze({
    columnBase: 0.7, // in front of the column's inner face, toward the nave
    columnFace: 0.45, // off a face, an uplight grazing it
    danceColumn: 1.0, // a smoke machine off the column…
    danceColumnAlong: 1.2, // …and this far toward the audience
    backLine: 0.25, // behind the riser's back edge, on the floor
    pit: 0.7, // in front of the riser's front edge
    backdropGap: 0.35, // off the backdrop's face
    towerArm: 0.3, // a side arm out from the tower's audience face
    towerFrom: 1.8, // the lowest arm
    towerPitch: 0.6 // arm to arm
})

/**
 * The stage frame the positions hang off: the riser (the decks nearest the stage zone,
 * or all decks), its axis, which way the audience is, and its edges.
 */
export const stageFrameOf = ({ pieces, plan }) => {
    const decks = pieces.filter((p) => p.category === 'deck' && p.outline)
    if (!decks.length) return null
    const xs = decks.flatMap((d) => d.outline.map((p) => p[0]))
    const zs = decks.flatMap((d) => d.outline.map((p) => p[1]))
    const rect = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)]
    const axis = r3((rect[0] + rect[2]) / 2)
    const centreZ = (rect[1] + rect[3]) / 2
    const dance = plan?.zones?.find((z) => z.id === 'dance') || null
    const danceZ = dance ? (dance.rects[0][1] + dance.rects[0][3]) / 2 : null
    const into = danceZ == null ? 1 : Math.sign(danceZ - centreZ) || 1
    const deck = Math.max(...decks.map((d) => d.height || 0))
    return {
        rect, axis, into, deck,
        width: r3(rect[2] - rect[0]),
        back: into > 0 ? rect[1] : rect[3],
        front: into > 0 ? rect[3] : rect[1]
    }
}

/** The z range the show uses: the stage and dance zones together (else the riser ± 30 m). */
const showRangeZ = (plan, stage) => {
    const rects = (plan?.zones || []).filter((z) => z.id === 'stage' || z.id === 'dance').flatMap((z) => z.rects)
    if (!rects.length) return [stage.front - 30, stage.front + 30].sort((a, b) => a - b)
    return [Math.min(...rects.map((r) => r[1])), Math.max(...rects.map((r) => r[3]))]
}

/** The column rows either side of the axis, nearest first: [[leftX, rightX], [nextLeft, nextRight], …]. */
const rowsOf = (plan, axis) => {
    const xs = [...new Set((plan?.columns || []).map((c) => c[0]))]
    const left = xs.filter((x) => x < axis).sort((a, b) => b - a)
    const right = xs.filter((x) => x > axis).sort((a, b) => a - b)
    const out = []
    for (let i = 0; i < Math.min(left.length, right.length); i++) out.push([left[i], right[i]])
    return out
}

const columnsIn = (plan, rowXs, [z0, z1], stage) => {
    const door = (plan?.openings || []).filter((o) => /door|gate/.test(o.id)).map((o) => (o.from[1] + o.to[1]) / 2)
    return (plan?.columns || [])
        .filter((c) => rowXs.includes(c[0]) && c[1] >= z0 - 1e-6 && c[1] <= z1 + 1e-6)
        // Not a column in a doorway's end wall: a lamp there stands in the way in.
        .filter((c) => door.every((dz) => Math.abs(c[1] - dz) > 3))
        .map((c) => ({ x: c[0], z: c[1], w: c[2], d: c[3], side: sideOf(c[0], stage.axis), dist: Math.abs(c[1] - (stage.back + stage.front) / 2) }))
        .sort((a, b) => a.dist - b.dist || a.x - b.x)
}

// Rank columns pairwise from the stage: the nearest pair is rank 0 on both sides.
const rankPairs = (cols) => {
    const n = { '-1': 0, 1: 0 }
    return cols.map((c) => ({ ...c, rank: n[c.side]++ }))
}

/**
 * A run as a line in the room: `at(s, face)` is the point `s` metres along it from its first
 * end, on the underside of the bottom chords (face −1), the top of the top chords (+1) or the
 * centre line (0) — offset perpendicular to the run in its vertical plane, as a clamp sits.
 * A flat run: the plan's line at the chord height ± half a section, as it always was; a
 * sloped run (the cut, 2026-09-29): along its true 3D length.
 */
export const runFrame = (run) => {
    const a = run.from3 || [run.from[0], run.height, run.from[1]]
    const b = run.to3 || [run.to[0], run.height, run.to[1]]
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const length = run.from3 ? run.length3 : run.length
    const l = Math.hypot(...d) || 1
    const u = d.map((v) => v / l)
    // up, less its part along the run: the chord's own "up"
    const n0 = [-u[1] * u[0], 1 - u[1] * u[1], -u[1] * u[2]]
    const nl = Math.hypot(...n0) || 1
    const n = n0.map((v) => v / nl)
    return {
        length,
        at: (s, face = 0) => a.map((v, k) => v + u[k] * s + n[k] * face * (TRUSS_SECTION_M / 2))
    }
}

const slot = (id, pos, { hung = false, side = 0, rank = 0, column = null } = {}) => ({ id, pos: pos.map(r3), hung, side, rank, ...(column ? { column } : {}) })

/**
 * Every position of a document, derived. Order: overhead, towers, the stage, the columns,
 * the backdrop — roughly the order a crew hangs in.
 * `lamps` (plotData's, optional): with them, a truss run that has lamps standing ON it also
 * lists its top chord ("… — on top"); without, only the hung clamp points.
 * @returns {{ id, name, kind: 'line'|'rows', order: 'along'|'stage', slots, note }[]}
 */
export const positionsOf = (entities = [], lamps = null) => {
    const pieces = piecesOf(entities)
    const { plan } = venueOf(entities)
    const out = []
    const stage = stageFrameOf({ pieces, plan })
    const axis = stage?.axis ?? 0

    // Truss runs: a clamp at each of the pieces' slot points, hung.
    for (const [i, run] of trussRuns(pieces).entries()) {
        const along = runFrame(run)
        const at = range(SLOT_PITCH_M / 2, along.length - SLOT_PITCH_M / 2, SLOT_PITCH_M)
        const name = run.name && run.name !== 'truss' ? run.name : `truss ${i + 1}`
        out.push({
            id: `truss:${run.ids[0]}`, name, kind: 'line', order: 'along',
            note: run.slopeDeg ? `${run.length3} m sloped ${run.slopeDeg}° (${run.from3[1]}–${run.to3[1]} m at the chord centre) · a clamp every ${SLOT_PITCH_M} m` : `${run.length} m at ${run.height} m · a clamp every ${SLOT_PITCH_M} m`,
            slots: at.map((s, k) => {
                const p = along.at(s, -1)
                return slot(`${k + 1}`, p, { hung: true, side: sideOf(p[0], axis), rank: k })
            })
        })
    }
    // …and standing ON each run's top chord at the same points — upright fixtures clamped
    // through the top chords (a moving-head beam aimed at the sky from a hung line: hung
    // under it, its tilt cannot reach straight up). Listed only for a run someone stands
    // lamps on, so a truss rig that never does keeps its rows as they were.
    for (const [i, run] of trussRuns(pieces).entries()) {
        const along = runFrame(run)
        const at = range(SLOT_PITCH_M / 2, along.length - SLOT_PITCH_M / 2, SLOT_PITCH_M)
        const slots = at.map((s, k) => {
            const p = along.at(s, 1)
            return slot(`${k + 1}`, p, { side: sideOf(p[0], axis), rank: k })
        })
        const riders = (lamps || []).filter((m) => slots.some((q) => Math.hypot(m.mount[0] - q.pos[0], m.mount[1] - q.pos[1], m.mount[2] - q.pos[2]) <= 0.05))
        if (!riders.length) continue
        const name = run.name && run.name !== 'truss' ? run.name : `truss ${i + 1}`
        out.push({ id: `truss-top:${run.ids[0]}`, name: `${name} — on top`, kind: 'line', order: 'along', note: `standing on the top chord, a clamp every ${SLOT_PITCH_M} m`, slots })
    }

    // Towers: side arms up the audience face, and the top plate.
    const towers = pieces.filter((p) => p.category === 'tower').sort((a, b) => a.position[0] - b.position[0])
    if (towers.length) {
        const into = stage?.into ?? 1
        const ladder = []
        const tops = []
        for (const t of towers) {
            const side = sideOf(t.position[0], axis)
            const top = t.position[1] + (t.height || 0)
            const z = t.position[2] + into * (TRUSS_SECTION_M / 2 + OFFSETS.towerArm)
            range(OFFSETS.towerFrom, top - 1, OFFSETS.towerPitch).forEach((h, k) => ladder.push(slot(`${side < 0 ? 'L' : side > 0 ? 'R' : 'C'}${k + 1}`, [t.position[0], h, z], { side, rank: k })))
            tops.push(slot(side < 0 ? 'L' : side > 0 ? 'R' : `T${tops.length + 1}`, [t.position[0], top, t.position[2]], { side, rank: 0 }))
        }
        out.push({ id: 'tower-ladders', name: 'tower ladders', kind: 'rows', order: 'along', note: `side arms on the audience face, ${OFFSETS.towerFrom} m up, every ${OFFSETS.towerPitch} m`, slots: ladder })
        out.push({ id: 'tower-tops', name: 'tower tops', kind: 'line', order: 'along', note: 'standing on the top plate', slots: tops })
    }

    if (stage) {
        const { into, back, front, width } = stage
        const half = width / 2
        const backZ = back - into * OFFSETS.backLine
        out.push({
            id: 'stage-back', name: 'stage back line', kind: 'line', order: 'along',
            note: `on the floor ${OFFSETS.backLine} m behind the riser, its width`,
            slots: range(axis - half, axis + half).map((x, k) => slot(`${k + 1}`, [x, 0, backZ], { side: sideOf(x, axis), rank: k }))
        })
        const flank = range(half + 0.5, half + 2)
        out.push({
            id: 'stage-flanks', name: 'stage flanks', kind: 'rows', order: 'stage',
            note: 'on the floor either side of the riser, in line with the back',
            slots: [-1, 1].flatMap((s) => flank.map((dx, k) => slot(`${s < 0 ? 'L' : 'R'}${k + 1}`, [axis + s * dx, 0, backZ], { side: s, rank: k })))
        })
        const pitHalf = half + 3
        out.push({
            id: 'pit', name: 'pit', kind: 'line', order: 'along',
            note: `on the floor ${OFFSETS.pit} m in front of the riser`,
            slots: range(axis - pitHalf, axis + pitHalf).map((x, k) => slot(`${k + 1}`, [x, 0, front + into * OFFSETS.pit], { side: sideOf(x, axis), rank: k }))
        })
    }

    if (plan && stage) {
        const zr = showRangeZ(plan, stage)
        const rows = rowsOf(plan, axis)
        if (rows[0]) {
            const nave = rankPairs(columnsIn(plan, rows[0], zr, stage))
            const inner = (c) => c.x - c.side * (c.w / 2) // the face toward the nave
            const outer = (c) => c.x + c.side * (c.w / 2)
            const lr = (c) => (c.side < 0 ? 'L' : 'R')
            out.push({
                id: 'column-bases', name: 'column bases', kind: 'rows', order: 'stage',
                note: `the nave columns, ${OFFSETS.columnBase} m in front of the inner face`,
                slots: nave.map((c) => slot(`${lr(c)}${c.rank + 1}`, [inner(c) - c.side * OFFSETS.columnBase, 0, c.z], { side: c.side, rank: c.rank, column: [c.x, c.z, c.w] }))
            })
            out.push({
                id: 'column-faces', name: 'column faces', kind: 'rows', order: 'stage',
                note: `an uplight on the inner and the back face of each nave column, ${OFFSETS.columnFace} m off`,
                slots: nave.flatMap((c) => [
                    slot(`${lr(c)}${c.rank + 1}i`, [inner(c) - c.side * OFFSETS.columnFace, 0, c.z], { side: c.side, rank: c.rank * 2, column: [c.x, c.z, c.w] }),
                    slot(`${lr(c)}${c.rank + 1}b`, [outer(c) + c.side * OFFSETS.columnFace, 0, c.z], { side: c.side, rank: c.rank * 2 + 1, column: [c.x, c.z, c.w] })
                ])
            })
            out.push({
                id: 'dance-columns', name: 'dance-floor columns', kind: 'rows', order: 'stage',
                note: `on the floor ${OFFSETS.danceColumn} m off a nave column, ${OFFSETS.danceColumnAlong} m toward the audience`,
                slots: nave.map((c) => slot(`${lr(c)}${c.rank + 1}`, [inner(c) - c.side * OFFSETS.danceColumn, 0, c.z + stage.into * OFFSETS.danceColumnAlong], { side: c.side, rank: c.rank, column: [c.x, c.z, c.w] }))
            })
        }
        if (rows[1]) {
            const next = rankPairs(columnsIn(plan, rows[1], zr, stage))
            out.push({
                id: 'outer-columns', name: 'outer columns', kind: 'rows', order: 'stage',
                note: `the next rows out, an uplight on the face toward the nave, ${OFFSETS.columnFace} m off`,
                slots: next.map((c) => slot(`${c.side < 0 ? 'L' : 'R'}${c.rank + 1}`, [c.x - c.side * (c.w / 2) - c.side * OFFSETS.columnFace, 0, c.z], { side: c.side, rank: c.rank, column: [c.x, c.z, c.w] }))
            })
        }
        // The backdrop: what stands on the floor behind the riser, within the show's width.
        const reach = rows[0] ? Math.min(...rows[0].map((x) => Math.abs(x - axis))) - 1.5 : 10
        const behind = (plan.solids || []).filter((s) => {
            const [x0, z0, x1, z1] = s.rect
            const near = stage.into > 0 ? z1 <= stage.back + 0.01 && z1 >= stage.back - 4 : z0 >= stage.back - 0.01 && z0 <= stage.back + 4
            return near && x1 > axis - reach && x0 < axis + reach
        })
        if (behind.length) {
            const faceAt = (x) => {
                const at = behind.filter((s) => x >= s.rect[0] - 1e-6 && x <= s.rect[2] + 1e-6)
                if (!at.length) return null
                return stage.into > 0 ? Math.max(...at.map((s) => s.rect[3])) : Math.min(...at.map((s) => s.rect[1]))
            }
            const x0 = Math.max(axis - reach, Math.min(...behind.map((s) => s.rect[0])))
            const x1 = Math.min(axis + reach, Math.max(...behind.map((s) => s.rect[2])))
            const xs = range(Math.ceil(x0 / PITCH) * PITCH, x1).filter((x) => faceAt(x) != null)
            out.push({
                // Named after what it lights, the first thing in it, in a word or two.
                id: 'backdrop', name: `backdrop · ${String(behind[0].label || behind[0].id).split(/[(,]/)[0].trim()}`, kind: 'line', order: 'along',
                note: `on the floor ${OFFSETS.backdropGap} m off the face of what stands behind the riser`,
                slots: xs.map((x, k) => slot(`${k + 1}`, [x, 0, faceAt(x) + stage.into * OFFSETS.backdropGap], { side: sideOf(x, axis), rank: k }))
            })
        }
    }
    return out
}

/** Which lamp fills each slot: its mount within 5 cm. Map(slotKey → lampId), slotKey = `${position.id}/${slot.id}`. */
export const fillOf = (positions, lamps, tolerance = 0.05) => {
    const out = new Map()
    const taken = new Set()
    for (const p of positions) {
        for (const s of p.slots) {
            const hit = lamps.find((l) => !taken.has(l.id) && Math.hypot(l.mount[0] - s.pos[0], l.mount[1] - s.pos[1], l.mount[2] - s.pos[2]) <= tolerance)
            if (hit) { out.set(`${p.id}/${s.id}`, hit.id); taken.add(hit.id) }
        }
    }
    return out
}
