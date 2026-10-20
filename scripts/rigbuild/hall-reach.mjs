// WHERE A RIG LAMP'S BEAM STOPS IN THE HALL, when epic-build writes it (PHYSICS FIRST, owner 2026-10-13). The room
// re-casts every beam at run time against the hall's own triangles (src/objectComponents/beamReach.js); this is the
// length written with the lamp, so the document never carries a reach that runs through the roof before the room
// has looked.
//
// ONE SOURCE (2026-10-20, owner rule "Physics first" 2): the building is the hall record's `dims.shell`, the wall, deck, lantern
// and glazing slabs scripts/place/hall_shell.py takes from the model the room draws (every corner a vertex of that GLB), plus
// the floor y = 0 the shell does not carry, bounded to the hall's footprint (the shell's x, z extent). This file used to copy the walls (-36.4 / 60.4, 53.8 / -53.6), the deck
// (truss_top_h_m) and a lantern roof (ridge_h_m over |x| <= 6, the whole length) by hand, the same hand planes physics_check.py
// had: on the owner's final reference rig they wrote four lamps and laser 42 longer than the model lets them go (the 12 m
// closed deck gap between the lantern segments) and had no second lantern. The rules are those of scripts/place/physics_check.py
// (slab method; a lamp ON a slab face and aimed away does not meet that slab; inside a slab = 0 m; the floor y = 0 also for a
// lamp AT floor level aiming down); a hall record without dims.shell is REFUSED, never cast against copied planes. The maths is
// a port because this runs in node: hall-reach.test.js casts the same rays through physics_check.py on the real shell and holds
// the two equal. Planes and slab boxes, not the hall's triangles; the lamp's rest axis (a look re-aims it and the room re-casts).
// Pure.
import fs from 'node:fs'
import path from 'node:path'
import { spotAimDirection } from '../../src/project/viewport/spotLightAim.js'

export const HALL_FILE = 'scripts/place/rigs/moxir-hall-2026-10-12-v13-skin.hall.json'
const FLOOR_Y = 0
const FACE_EPS = 1e-6 // m: an origin this close to a face is ON it (a lamp mounted flush); physics_check.py FACE_EPS

/** The hall's dims from its record ({ dims }), or null when the file is not there. */
export const hallDimsOf = (file, root = '.') => {
    const p = path.isAbsolute(file) ? file : path.join(root, file)
    if (!fs.existsSync(p)) return null
    return JSON.parse(fs.readFileSync(p, 'utf8')).dims || null
}

/** dims.shell as boxes [{ name, lo, hi }]. Throws (a refusal, like physics_check.py's exit 2) for a record with none or a slab without extent. */
export const shellOf = (dims) => {
    const shell = dims?.shell
    if (!Array.isArray(shell) || shell.length === 0) {
        throw new Error('the hall record has no dims.shell (the wall and roof slabs of hall_shell.py); refusing to cast beams against copied planes. Run: python3 scripts/place/hall_shell.py --hall <record> --write')
    }
    return shell.map((m) => {
        const lo = ['x_m', 'y_m', 'z_m'].map((k) => Number(m?.[k]?.[0]))
        const hi = ['x_m', 'y_m', 'z_m'].map((k) => Number(m?.[k]?.[1]))
        if ([...lo, ...hi].some((v) => !Number.isFinite(v))) throw new Error(`dims.shell slab ${JSON.stringify(m?.id ?? m)} has no x_m/y_m/z_m [min, max]`)
        return { name: `${m.surface || 'shell'} [${m.id || '?'}]`, lo, hi }
    })
}

/** [t_in, t_out] along the unit ray p + t d inside the box, t >= 0; null if it misses, the box is behind, or the ray only leaves or grazes a face it starts on. */
const raySpan = (p, d, lo, hi) => {
    let t0 = 0
    let t1 = Infinity
    for (let i = 0; i < 3; i += 1) {
        if (Math.abs(d[i]) < 1e-12) {
            if (p[i] < lo[i] || p[i] > hi[i]) return null
            continue
        }
        let a = (lo[i] - p[i]) / d[i]
        let b = (hi[i] - p[i]) / d[i]
        if (a > b) [a, b] = [b, a]
        t0 = Math.max(t0, a)
        t1 = Math.min(t1, b)
        if (t0 > t1) return null
    }
    if (t0 <= 0) { // the origin is in the box or on its surface
        const margin = (q) => Math.min(...[0, 1, 2].map((i) => Math.min(q[i] - lo[i], hi[i] - q[i])))
        if (margin(p) <= FACE_EPS && margin(p.map((v, i) => v + 1e-3 * d[i])) <= FACE_EPS) return null // on a face, aimed along or away from the slab
    }
    return [t0, t1]
}

/** dims.shell as boxes with the footprint (x, z) and the top of the building: the box that holds every slab, the floor y = 0 at the bottom. */
const extentOf = (shell) => {
    const lo = [0, 1, 2].map((i) => Math.min(...shell.map((b) => b.lo[i])))
    const hi = [0, 1, 2].map((i) => Math.max(...shell.map((b) => b.hi[i])))
    lo[1] = FLOOR_Y
    return { lo, hi }
}
const insideFootprint = (q, { lo, hi }) => [0, 2].every((i) => q[i] >= lo[i] - FACE_EPS && q[i] <= hi[i] + FACE_EPS)
const outsideHall = (p, { lo, hi }) => [0, 1, 2].some((i) => p[i] < lo[i] - FACE_EPS || p[i] > hi[i] + FACE_EPS)

/** The opening a ray that meets nothing left the hall through ('end-wall-entry opening', 'the roof'), or null when it started outside the hall.
 * physics_check.py opening_of, line for line: the ray leaves the box that holds the shell at one face; the slab group touching that face
 * nearest the exit point names the wall (its id without the trailing -number); the top face is the roof. */
const openingOf = (p, d, shell, ext) => {
    if (outsideHall(p, ext)) return null
    let t = Infinity
    let face = null
    for (let i = 0; i < 3; i += 1) {
        if (Math.abs(d[i]) < 1e-12) continue
        let ti
        let side
        if (d[i] > 0) { ti = (ext.hi[i] - p[i]) / d[i]; side = 1 } else if (i === 1) continue // downward: the floor is the bottom, never a way out
        else { ti = (ext.lo[i] - p[i]) / d[i]; side = 0 }
        if (ti < t) { t = ti; face = [i, side] }
    }
    if (!face) return null
    const [i, side] = face
    if (i === 1) return 'the roof'
    const q = p.map((v, k) => v + t * d[k])
    const edge = (side ? ext.hi : ext.lo)[i]
    const gap = (b) => Math.hypot(...[0, 1, 2].map((k) => Math.max(b.lo[k] - q[k], q[k] - b.hi[k], 0)))
    const touching = shell.filter((b) => Math.abs((side ? b.hi : b.lo)[i] - edge) <= FACE_EPS)
    if (touching.length === 0) return `the ${'xyz'[i]}${side ? '+' : '-'} edge of the hall`
    let near = touching[0]
    for (const b of touching) if (gap(b) < gap(near)) near = b
    const sid = near.name.includes('[') ? near.name.slice(near.name.indexOf('[') + 1, -1) : near.name
    return `${sid.replace(/-\d+$/, '')} opening`
}

/**
 * The first hall surface along a ray (p, unit d), with its name as physics_check.py first_surface gives it: { t, name, depth }.
 * t in metres, 0 for a lamp inside a slab or on the floor aiming down, Infinity when it meets nothing. The name is the floor, a slab
 * ('<surface> [<id>]'), 'open sky (through <opening>)' (the ray left through a gap of the shell) or 'none (open sky)' (it started outside
 * the hall). THE FLOOR IS THE HALL'S FOOTPRINT, not the infinite plane y = 0: a ray that would meet y = 0 beyond the shell's x, z extent
 * meets nothing (2026-10-20 review). Throws for a dims without a shell (shellOf).
 */
export const hallFirstSurface = (p, d, dims) => {
    const shell = shellOf(dims)
    const ext = extentOf(shell)
    let best = null
    // two surfaces at the same distance (a ray into the corner of two walls): the one whose name sorts first, as physics_check.py's min() of (t, name)
    const take = (t, name, depth) => { if (best == null || t < best.t || (t === best.t && name < best.name)) best = { t, name, depth } }
    if (d[1] < -1e-9 && p[1] > FLOOR_Y - FACE_EPS) {
        const tf = Math.max(0, (FLOOR_Y - p[1]) / d[1])
        if (insideFootprint(p.map((v, k) => v + tf * d[k]), ext)) take(tf, 'floor', Infinity)
    }
    for (const { name, lo, hi } of shell) {
        const s = raySpan(p, d, lo, hi)
        if (s) take(s[0], name, s[1] - s[0])
    }
    if (best) return best
    const through = openingOf(p, d, shell, ext)
    return { t: Infinity, name: through == null ? 'none (open sky)' : `open sky (through ${through})`, depth: Infinity }
}

/**
 * The first hall surface along a ray (p, unit d): the floor of the hall, or a dims.shell slab. Metres; 0 for a lamp inside a slab or on the
 * floor aiming down; null when it meets nothing (open sky). Throws for a dims without a shell (shellOf).
 */
export const hallFirstHit = (p, d, dims) => {
    if (!dims) return null
    const { t } = hallFirstSurface(p, d, dims)
    return Number.isFinite(t) ? t : null
}

/** A lamp's first surface along its rest axis (f.p, f.r: three.js Euler XYZ, a spot points down its local −Y): { t, name, depth, why? } or null
 * (no hall, no position). A first hit of 0 m carries why: 'inside_slab' or 'on_floor', the words physics_check.py marks its rows with. */
export const lampFirstSurface = (f, dims) => {
    if (!dims || !Array.isArray(f?.p)) return null
    const hit = hallFirstSurface(f.p, spotAimDirection(f.r || [0, 0, 0]), dims)
    return hit.t === 0 ? { ...hit, why: hit.name === 'floor' ? 'on_floor' : 'inside_slab' } : hit
}

/** A lamp's first hit along its rest axis, metres (null: open sky or no hall). */
export const lampFirstHit = (f, dims) => {
    const hit = lampFirstSurface(f, dims)
    return hit && Number.isFinite(hit.t) ? hit.t : null
}
