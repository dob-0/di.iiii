// @vitest-environment node
// THE LANTERN GUARD (audit A-03, 2026-10-05): the six class-4 LaserCubes of Known · full were all aimed
// at one point inside the roof lantern over the house — an opening glazed as a skylight, where a beam may
// leave the building. Every laser's beam, followed up to the roof deck, must land on the solid deck, not
// in a lantern, and the beams must not converge on one point.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { REPO_ROOT } from '../place/common.mjs'
import { buildRig } from '../place/rig-lib.mjs'
import { readGeometry } from '../place/fixtures-glb.mjs'
import { atHeight, inLantern } from './safety.mjs'
import { spotAimDirection } from '../../src/project/viewport/spotLightAim.js'

const read = (f) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'))
const manifest = read('scripts/place/fixtures/fixtures.json')
const geometry = Object.fromEntries(Object.keys(manifest.kinds).map((k) => [k, readGeometry(k)]))


describe('lasers clear the roof lanterns', () => {
    const rig = read('scripts/place/rigs/moxir-2026-10-17-known-full.json')
    const hall = read(rig.hall)
    const g = hall.geometry
    const lasers = buildRig(rig, hall, { geometry, manifest }).entities.filter((e) => e.type === 'spotLight' && /lasercube/.test(e.id))
    const hits = lasers.map((e) => ({ id: e.id, at: atHeight(e.components.transform.position, spotAimDirection(e.components.transform.rotation), g.deck_m) }))

    it('finds the six cubes, every beam rising to the deck', () => {
        expect(lasers).toHaveLength(6)
        for (const h of hits) expect(h.at, h.id).not.toBe(null)
    })
    it('lands every beam on the solid deck, none in a lantern', () => {
        expect(hits.filter((h) => inLantern(h.at, g.lanterns)).map((h) => h.id)).toEqual([])
    })
    it('fans them out: no two beams land within 1 m of each other', () => {
        for (let i = 0; i < hits.length; i += 1) for (let j = i + 1; j < hits.length; j += 1) {
            expect(Math.hypot(hits[i].at[0] - hits[j].at[0], hits[i].at[2] - hits[j].at[2]), `${hits[i].id} / ${hits[j].id}`).toBeGreaterThan(1)
        }
    })
})
