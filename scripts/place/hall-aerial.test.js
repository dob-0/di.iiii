// @vitest-environment node
// 2026-10-07 the space fixed from the aerial survey (docs/moxir/AERIAL_2026-10-07.md): the layer says what
// changed and where it came from, and the committed hall record agrees. The grid and the cranes do not move.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { REPO_ROOT } from './common.mjs'

const read = (f) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/place/rigs', f), 'utf8'))
const layer = read('moxir-hall-dims-2026-10-07.json')
const aerial = read('moxir-aerial-2026-10-07.json').result
const before = read('moxir-hall-2026-10-02-crane-dj.hall.json')
const after = read('moxir-hall-2026-10-07.hall.json')

describe('the 2026-10-07 aerial corrections', () => {
    it('every value carries source, method, +- and date', () => {
        for (const key of ['lantern_segments_m', 'end_wall_in_from_grid_m', 'crane_bridge_bottom_h_m']) {
            for (const field of ['value', 'source', 'method', 'pm_m', 'date']) expect(layer[key][field], `${key}.${field}`).toBeDefined()
        }
    })
    it('the lanterns are the measured +-6.0 ... +-46.9 m from the joint', () => {
        const [lo, hi] = aerial.lantern_from_joint_m.value
        expect(layer.lantern_segments_m.value).toEqual([[-hi, -lo], [lo, hi]])
        for (const l of after.geometry.lanterns) expect(l.z_m.map(Math.abs).sort((a, b) => a - b)).toEqual([lo, hi])
    })
    it('the end walls close the hall at the measured roof length, on the unchanged 6 m grid', () => {
        expect(after.geometry.outer_length_m).toBeCloseTo(aerial.length_m.value, 1)
        expect(after.geometry.column_grid_z_m).toEqual(before.geometry.column_grid_z_m)
        expect(after.dims.length_m).toBe(108)
    })
    it('the cranes are unchanged apart from the per-crane basis text; the near crane is marked ASSUMED', () => {
        const strip = (c) => { const { girder_bottom_basis: _b, ...rest } = c; return rest }
        expect(after.geometry.cranes.map(strip)).toEqual(before.geometry.cranes.map(strip))
        expect(layer.crane_bridge_bottom_h_m.per_crane.find((c) => c.assumed_for_near_crane).from_door_m).toBe(49.2)
        expect(after.geometry.cranes[0].girder_bottom_basis).toMatch(/^ASSUMED/)
    })
    it('the solar roof is noted as SUSPECTED', () => {
        expect(layer.suspected.solar_roof).toMatch(/SUSPECTED/)
    })
})
