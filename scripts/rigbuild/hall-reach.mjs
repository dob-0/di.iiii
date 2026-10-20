// WHERE A RIG LAMP'S BEAM STOPS IN THE HALL, when epic-build writes it (PHYSICS FIRST, owner 2026-10-13). The room
// re-casts every beam at run time against the hall's own triangles (src/objectComponents/beamReach.js); this is the
// length written with the lamp, so the document never carries a reach that runs through the roof before the room
// has looked. The building is the hall record's dims and the hall frame's walls, the same surfaces as
// scripts/place/physics_check.py (walls: moxir_v2_8_floor.py): the four walls, the floor, the roof deck underside
// (truss_top_h_m: the space frame is open lattice, the deck the first solid surface) and the lantern glazing (ridge_h_m)
// over the centre band (lantern_w_m). Planes, not the hall's triangles; the lamp's rest axis (a look re-aims it and
// the room re-casts). Pure.
import fs from 'node:fs'
import path from 'node:path'
import { firstHit } from '../../src/objectComponents/beamReach.js'
import { spotAimDirection } from '../../src/project/viewport/spotLightAim.js'

export const HALL_FILE = 'scripts/place/rigs/moxir-hall-2026-10-12-v13-skin.hall.json'
export const HALL_WALLS = Object.freeze({ westX: -36.4, eastX: 60.4, entryZ: 53.8, backZ: -53.6 })

/** The hall's dims from its record ({ dims }), or null when the file is not there. */
export const hallDimsOf = (file, root = '.') => {
    const p = path.isAbsolute(file) ? file : path.join(root, file)
    if (!fs.existsSync(p)) return null
    return JSON.parse(fs.readFileSync(p, 'utf8')).dims || null
}

/** The first hall surface along a ray (p, unit d) — physics_check.py first_surface, line for line. Null: a miss. */
export const hallFirstHit = (p, d, dims, walls = HALL_WALLS) => {
    if (!dims) return null
    const planes = [
        { normal: [1, 0, 0], point: [walls.eastX, 0, 0] },
        { normal: [1, 0, 0], point: [walls.westX, 0, 0] },
        { normal: [0, 0, 1], point: [0, 0, walls.entryZ] },
        { normal: [0, 0, 1], point: [0, 0, walls.backZ] },
        { normal: [0, 1, 0], point: [0, 0, 0] }
    ]
    let t = firstHit(p, d, planes)
    if (d[1] > 1e-9) {
        const deck = Number(dims.truss_top_h_m)
        const ridge = Number(dims.ridge_h_m)
        const halfLantern = Number(dims.lantern_w_m) / 2
        const tDeck = (deck - p[1]) / d[1]
        const xAt = p[0] + d[0] * tDeck
        const up = Math.abs(xAt) <= halfLantern ? (ridge - p[1]) / d[1] : tDeck
        if (up > 1e-6 && (t == null || up < t)) t = up
    }
    return t
}

/** A lamp's first hit along its rest axis (f.p, f.r: three.js Euler XYZ, a spot points down its local −Y). */
export const lampFirstHit = (f, dims, walls = HALL_WALLS) => (Array.isArray(f?.p) ? hallFirstHit(f.p, spotAimDirection(f.r || [0, 0, 0]), dims, walls) : null)
