// @vitest-environment node
// 2026-10-02: the permanent objects near the stage (hall dims layer 2026-10-02, massing_add) are in the hall
// record Known · full is hung in. No lamp of the live room may stand inside one, and (recorded, not asserted)
// the beams that first hit one are listed by the printed summary below for the session note.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { REPO_ROOT } from '../place/common.mjs'
import { RIG_PREFIX, buildRig } from '../place/rig-lib.mjs'
import { readGeometry } from '../place/fixtures-glb.mjs'

const read = (f) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'))
const rig = read('scripts/place/rigs/moxir-2026-10-17-known-full.json')
const hall = read(rig.hall)
const manifest = read('scripts/place/fixtures/fixtures.json')
const geometry = Object.fromEntries(Object.keys(manifest.kinds).map((k) => [k, readGeometry(k)]))
const layer = read('scripts/place/rigs/moxir-hall-dims-2026-10-02.json')
const added = (layer.massing_add || [])

describe('Known · full among the permanent objects', () => {
    it('has no lamp standing inside one of them', () => {
        const built = buildRig(rig, hall, { geometry, manifest })
        const lamps = built.entities.filter((e) => e.id.startsWith(RIG_PREFIX) && e.components?.fixture?.type)
        expect(lamps.length).toBeGreaterThan(60)
        const inside = []
        for (const e of lamps) {
            const [x, y, z] = e.components.transform.position
            for (const m of added) {
                if (x > m.x_m[0] && x < m.x_m[1] && z > m.z_m[0] && z < m.z_m[1] && y > m.y_m[0] && y < m.y_m[1]) inside.push(`${e.id} in ${m.id}`)
            }
        }
        expect(inside).toEqual([])
    })
})
