// @vitest-environment node
// "The truss is not from the crane" (owner, 2026-09-30): the bridle legs stopped `clamp_drop_m` (0.15 m)
// below the girders and nothing was drawn between, and the legs were 14 mm boxes. Every pick's two legs
// must now end in a beam clamp that reaches the girder's underside, the safety steel in its own clamp, and
// the legs must be thick enough to read from an orbit distance.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { REPO_ROOT } from '../place/common.mjs'
import { buildRig, stageFrame } from '../place/rig-lib.mjs'
import { readGeometry } from '../place/fixtures-glb.mjs'
import { RIG_PREFIX } from './ground-movers.mjs'
import { PIECES_GLB_DIR } from './pieces-glb.mjs'
import { rigFileOf, VERSIONS_FILE } from './versions.mjs'

const read = (f) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'))
const spec = read(VERSIONS_FILE)
const hall = read(spec.hall)
const manifest = read('scripts/place/fixtures/fixtures.json')
const geometry = Object.fromEntries(Object.keys(manifest.kinds).map((k) => [k, readGeometry(k)]))

// a base-anchored box (rig-lib `box`) turned by three.js Euler 'XYZ' [a, 0, c]: its +Y goes to (-sin c, cos c cos a, cos c sin a)
const topOf = (e) => {
    const t = e.components.transform
    const [a, , c] = t.rotation
    const len = t.scale[1]
    return [t.position[0] + len * -Math.sin(c), t.position[1] + len * Math.cos(c) * Math.cos(a), t.position[2] + len * Math.cos(c) * Math.sin(a)]
}

describe.each(['minimal-ground', 'full-ground'])('%s: the truss hangs from the crane', (id) => {
    const rig = read(rigFileOf(spec.set, id))
    const stage = stageFrame(rig, hall)
    const built = buildRig(rig, hall, { geometry, manifest })
    const byId = Object.fromEntries(built.entities.map((e) => [e.id, e]))
    const picks = rig.truss.rigging.picks_u_m
    const drop = rig.truss.rigging.bridle.clamp_drop_m
    const girder = stage.crane.girder_bottom_m

    it('has three picks with a clamp on each bridle leg and one on the safety steel', () => {
        expect(picks).toHaveLength(3)
        for (let i = 1; i <= picks.length; i += 1) {
            for (const part of ['clamp-a', 'clamp-b', 'steel-clamp']) expect(byId[`${RIG_PREFIX}hoist-${i}-${part}`], `${part} of pick ${i}`).toBeTruthy()
        }
    })

    it('every leg ends where its clamp starts, and every clamp reaches the girder underside', () => {
        for (let i = 1; i <= picks.length; i += 1) {
            for (const [leg, clamp] of [['bridle-a', 'clamp-a'], ['bridle-b', 'clamp-b']]) {
                const top = topOf(byId[`${RIG_PREFIX}hoist-${i}-${leg}`])
                const c = byId[`${RIG_PREFIX}hoist-${i}-${clamp}`].components.transform
                expect(c.position[1]).toBeCloseTo(top[1], 2)
                expect(c.position[0]).toBeCloseTo(top[0], 2)
                expect(c.position[2]).toBeCloseTo(top[2], 2)
                expect(c.position[1] + c.scale[1]).toBeCloseTo(girder, 3)
                expect(c.scale[1]).toBeCloseTo(drop, 3)
            }
            const steel = byId[`${RIG_PREFIX}hoist-${i}-steel`]
            const sc = byId[`${RIG_PREFIX}hoist-${i}-steel-clamp`].components.transform
            expect(sc.position[1]).toBeCloseTo(topOf(steel)[1], 2)
            expect(sc.position[1] + sc.scale[1]).toBeCloseTo(girder, 3)
        }
    })

    it('draws the legs and steels thick enough to read from an orbit distance (at least 25 mm)', () => {
        for (let i = 1; i <= picks.length; i += 1) {
            for (const part of ['bridle-a', 'bridle-b']) expect(byId[`${RIG_PREFIX}hoist-${i}-${part}`].components.transform.scale[0]).toBeGreaterThanOrEqual(0.025)
            expect(byId[`${RIG_PREFIX}hoist-${i}-steel`].components.transform.scale[0]).toBeGreaterThanOrEqual(0.02)
        }
    })
})

// "the truss is not from the crane" (owner, 2026-09-30, checked on his screen): the room has NO environment map, so
// metal (metalness 0.8-0.9) renders near-black in a dark hall and the truss and its hangers vanished. Steel is matte
// now, and the thin rigging carries a faint self-light so the hang reads at an orbit distance.
describe('rigging reads in a dark room with no environment map', () => {
    const rig = read(rigFileOf(spec.set, 'minimal-ground'))
    const built = buildRig(rig, hall, { geometry, manifest })
    const rigging = built.entities.filter((e) => new RegExp(`^${RIG_PREFIX}(hoist-\\d|tieoff-)`).test(e.id))

    it('every hoist, leg, chain, clamp and steel is matte (metalness <= 0.4) and none is black', () => {
        expect(rigging.length).toBeGreaterThan(20)
        for (const e of rigging) {
            const a = e.components.appearance
            expect(a.metalness, e.id).toBeLessThanOrEqual(0.4)
            const [r, g, b] = [1, 3, 5].map((i) => parseInt(a.color.slice(i, i + 2), 16))
            expect(Math.max(r, g, b), `${e.id} colour ${a.color}`).toBeGreaterThanOrEqual(0x40)
        }
    })

    it('the thin pieces (legs, steels, chains, clamps, hoists) carry a self-light', () => {
        const thin = rigging.filter((e) => !/tieoff-/.test(e.id))
        for (const e of thin) expect(e.components.appearance.emissive, e.id).not.toBe('#000000')
    })

    it('the truss and deck bodies are not metallic (a metallic 0.8 truss was drawn black)', () => {
        for (const kind of ['truss-1m', 'truss-2m', 'truss-3m', 'tower']) {
            const buf = fs.readFileSync(path.join(REPO_ROOT, PIECES_GLB_DIR, `${kind}.glb`))
            const jsonLen = buf.readUInt32LE(12)
            const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'))
            expect(json.materials[0].pbrMetallicRoughness.metallicFactor, kind).toBeLessThanOrEqual(0.4)
        }
    })
})
