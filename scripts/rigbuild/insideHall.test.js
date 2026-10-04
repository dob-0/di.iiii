// @vitest-environment node
// THE HALL'S WALLS (audit A-10, 2026-10-05): hazer 04 and smoke machine 04 of Known · full stood at
// z 55.2, outside the 54.5 m end wall — the 'nave-columns' mount put every effect 1.2 m off its column
// toward the audience, and the last column pair is 0.5 m from the wall. Every fixture and effect of the
// show's rig must stand inside the hall's walls.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { REPO_ROOT } from '../place/common.mjs'
import { buildRig } from '../place/rig-lib.mjs'
import { readGeometry } from '../place/fixtures-glb.mjs'

const read = (f) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'))
const manifest = read('scripts/place/fixtures/fixtures.json')
const geometry = Object.fromEntries(Object.keys(manifest.kinds).map((k) => [k, readGeometry(k)]))
const SHOW = ['moxir-2026-10-17-known-full.json', 'moxir-2026-10-17-known-ground.json']

describe('inside the hall', () => {
    it.each(SHOW)('%s: every fixture and effect stands inside the walls', (file) => {
        const rig = read(`scripts/place/rigs/${file}`)
        const hall = read(rig.hall)
        const g = hall.geometry
        const built = buildRig(rig, hall, { geometry, manifest })
        // every model the room draws — lamps and the effect machines — where its Base stands (fixture-lib's
        // posed parts are matrices; the translation is the mount point)
        const placed = built.fixtures.map((f) => {
            const m = f.parts.Base || Object.values(f.parts)[0]
            return { id: f.id, pos: [m.elements[12], m.elements[13], m.elements[14]] }
        })
        expect(placed.length).toBeGreaterThan(40)
        expect(placed.some((p) => /^(hazer|smoke)/.test(p.id))).toBe(true)
        const outside = placed.filter(({ pos: [x, , z] }) => z > g.end_wall_inner_y_m || z < g.far_wall_z_m || x < g.walls_x_m[0] || x > g.walls_x_m[1])
            .map((p) => `${p.id} at ${p.pos.map((v) => v.toFixed(2)).join(', ')}`)
        expect(outside).toEqual([])
    })
})
