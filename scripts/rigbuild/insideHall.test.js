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
import { outsideHall, outsideHallLines } from './safety.mjs'

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
        expect(outsideHallLines(placed, g)).toEqual([])
    })

    it('can fail: a lamp 1 m past the end wall is caught, one inside is not', () => {
        const g = { end_wall_inner_y_m: 54.5, far_wall_z_m: 0, walls_x_m: [-10, 10] }
        expect(outsideHallLines([{ id: 'out', pos: [0, 3, 55.5] }, { id: 'in', pos: [0, 3, 54] }], g)).toEqual(['out at 0.00, 3.00, 55.50'])
        expect(outsideHall([{ id: 'side', pos: [10.1, 3, 5] }], g)).toHaveLength(1)
    })
})
