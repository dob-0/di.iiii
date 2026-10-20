// WHERE A RIG LAMP'S BEAM STOPS IN THE HALL, when epic-build writes it (PHYSICS FIRST, owner 2026-10-13). The room
// re-casts every beam at run time against the hall's own triangles (src/objectComponents/beamReach.js); this is the
// length written with the lamp, so the document never carries a reach that runs through the roof before the room
// has looked.
//
// ONE SOURCE (2026-10-20, owner rule "Physics first" 2): the building is the hall record's `dims.shell`, the wall, deck, lantern
// and glazing slabs scripts/place/hall_shell.py takes from the model the room draws (every corner a vertex of that GLB), plus
// the floor y = 0 the shell does not carry. This file used to copy the walls (-36.4 / 60.4, 53.8 / -53.6), the deck
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

/**
 * The first hall surface along a ray (p, unit d): the floor, or a dims.shell slab. Metres; 0 for a lamp inside a slab or on the
 * floor aiming down; null when it meets nothing (open sky). Throws for a dims without a shell (shellOf).
 */
export const hallFirstHit = (p, d, dims) => {
    if (!dims) return null
    let best = null
    if (d[1] < -1e-9 && p[1] > FLOOR_Y - FACE_EPS) best = Math.max(0, (FLOOR_Y - p[1]) / d[1])
    for (const { lo, hi } of shellOf(dims)) {
        const s = raySpan(p, d, lo, hi)
        if (s && (best == null || s[0] < best)) best = s[0]
    }
    return best
}

/** A lamp's first hit along its rest axis (f.p, f.r: three.js Euler XYZ, a spot points down its local −Y). */
export const lampFirstHit = (f, dims) => (Array.isArray(f?.p) ? hallFirstHit(f.p, spotAimDirection(f.r || [0, 0, 0]), dims) : null)
