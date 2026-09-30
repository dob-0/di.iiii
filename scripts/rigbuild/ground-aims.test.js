// @vitest-environment node
// Ground movers, aim guard (2026-09-30): in every look of the two ground versions no lit moving head's
// beam may end on a solid — a column above all — nearer than 3 m. Found by the light-footprints tool: the
// column UP-B380F of `slow-sweep` and `gs-slow-fan` leaned OUT into their own columns (1.4-1.5 m throw, a
// 0.04 m spot at 7-8 million lux) and the room drew the beam through the column (rig-lib `surfaceHit`
// knows no columns). The ray is footprints.mjs' own (`analyse` -> `castRay`), not a second one.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { REPO_ROOT } from '../place/common.mjs'
import { readGeometry } from '../place/fixtures-glb.mjs'
import { analyse } from './footprints.mjs'
import { isMover } from './ground-movers.mjs'
import { loadLibrary } from './library.mjs'
import { VERSIONS_FILE, rigFileOf } from './versions.mjs'

const MIN_MOVER_THROW_M = 3

const read = (f) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'))
const spec = read(VERSIONS_FILE)
const hall = read(spec.hall)
const manifest = read('scripts/place/fixtures/fixtures.json')
const geometry = Object.fromEntries(Object.keys(manifest.kinds).map((k) => [k, readGeometry(k)]))
const library = loadLibrary()
const GROUND = ['minimal-ground', 'full-ground']

const shortMoverHits = (id) => {
    const rig = read(rigFileOf(spec.set, id))
    const codeOf = Object.fromEntries(rig.groups.map((g) => [g.id, rig.classes[g.class].code]))
    const { looks } = analyse({ rig, hall, manifest, geometry, library, version: id })
    return { looks, bad: looks.flatMap((l) => l.rows
        .filter((x) => x.lit && isMover(codeOf[x.group], library) && x.surface !== 'open air' && x.throwM < MIN_MOVER_THROW_M)
        .map((x) => `${id} / ${l.id}: ${x.id} first hits ${x.surface} (${x.detail}) at ${x.throwM} m`)) }
}

describe('ground movers: no beam ends on a solid within 3 m', () => {
    for (const id of GROUND) {
        it(`${id}: every look, every lit mover`, () => {
            const { looks, bad } = shortMoverHits(id)
            expect(looks.length).toBeGreaterThanOrEqual(14)
            expect(bad).toEqual([])
        })
    }

    it('the column beams of slow-sweep and gs-slow-fan lean IN, and reach the roof', () => {
        for (const id of GROUND) {
            const rig = read(rigFileOf(spec.set, id))
            const { looks } = analyse({ rig, hall, manifest, geometry, library, version: id, looks: ['slow-sweep', 'gs-slow-fan'] })
            for (const l of looks) {
                const rows = l.rows.filter((x) => x.group === 'beam380-columns-6' && x.lit)
                expect(rows).toHaveLength(6)
                for (const x of rows) {
                    expect(x.surface).toBe('roof')
                    expect(x.throwM).toBeGreaterThan(10)
                }
            }
        }
    })
})
