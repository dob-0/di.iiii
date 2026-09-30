// @vitest-environment node
// "Movers on the ground" (owner, 2026-09-30; RIG_BUILD.md §15.12): the policy guard that holds every
// rig file which opts in — today minimal-ground and full-ground, any future version by one flag —
// and what is its own about these two: counts against the rental house's stock, every fixture in the
// hall, none in the machinery or on the DJ riser, the lasers' height, the effects on the floor.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { REPO_ROOT } from '../place/common.mjs'
import { buildRig, stageFrame } from '../place/rig-lib.mjs'
import { readGeometry } from '../place/fixtures-glb.mjs'
import { spotAimDirection } from '../../src/project/viewport/spotLightAim.js'
import { findVersion, RIGS_DIR, rentalFileOf, rigFileOf, VERSIONS_FILE } from './versions.mjs'
import { loadLibrary } from './library.mjs'
import {
    ANALYSIS_FILE, RIG_PREFIX, analysis, buildAllLooks, groundPolicyViolations, isLaser, isMover, lowestInZone, machineryBoxes, mountHeight, riserBox, zoneBox
} from './ground-movers.mjs'

const read = (f) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'))
const spec = read(VERSIONS_FILE)
const hall = read(spec.hall)
const manifest = read('scripts/place/fixtures/fixtures.json')
const geometry = Object.fromEntries(Object.keys(manifest.kinds).map((k) => [k, readGeometry(k)]))
const library = loadLibrary()
const GROUND = ['minimal-ground', 'full-ground']
const rigs = Object.fromEntries(GROUND.map((id) => [id, read(rigFileOf(spec.set, id))]))
const builds = Object.fromEntries(GROUND.map((id) => [id, buildAllLooks(rigs[id], hall, { geometry, manifest })]))
const stageOf = (rig) => stageFrame(rig, hall)
const codeOf = (rig, g) => rig.classes[g.class].code
const groupOfEntity = (rig, e) => rig.groups.find((g) => e.id.startsWith(`${RIG_PREFIX}${g.id}-`))

// every rig file in the rigs directory, so a version added next month is held to the policy the day it opts in
const allRigFiles = fs.readdirSync(path.join(REPO_ROOT, RIGS_DIR)).filter((f) => /^moxir-2026-10-17-.*\.json$/.test(f) && !/\.(show|patch)\.json$/.test(f))
    .map((f) => ({ file: `${RIGS_DIR}/${f}`, rig: read(`${RIGS_DIR}/${f}`) })).filter((x) => x.rig.groups)

describe('the policy: no moving fixture hung above 0.6 m (applies to every rig file that opts in)', () => {
    it('is kept by every rig file with policy.movingFixtures.ground_only — the two versions and any future one', () => {
        const optedIn = allRigFiles.filter((x) => x.rig.policy?.movingFixtures?.ground_only)
        expect(optedIn.map((x) => x.rig.variant.id).sort()).toEqual([...GROUND].sort())
        for (const { file, rig } of optedIn) {
            const b = buildAllLooks(rig, hall, { geometry, manifest })
            expect(groundPolicyViolations({ rig, hall, library, builds: b, stage: stageOf(rig) }), file).toEqual([])
        }
    })

    it('cannot be dodged by name: a rig file called *ground* must carry the flag', () => {
        for (const { file, rig } of allRigFiles.filter((x) => /ground/.test(x.rig.variant?.id || ''))) {
            expect(rig.policy?.movingFixtures?.ground_only, `${file} is named ground and does not opt in`).toBe(true)
            expect(rig.policy.movingFixtures.max_mount_height_m).toBe(0.6)
        }
    })

    it('fails, in words, for a mover hung from the truss', () => {
        const rig = structuredClone(rigs['minimal-ground'])
        const hung = { ...spec.groups['beam380-cut'], id: 'beam380-cut' }
        rig.groups.push(hung)
        rig.looks['red-room'].aims['beam380-cut'] = { rule: 'fan', spread_deg: 24, lean_deg: 3 }
        const b = { 'red-room': buildRig(rig, hall, { geometry, manifest, look: 'red-room' }) }
        const v = groundPolicyViolations({ rig, hall, library, builds: b, stage: stageOf(rig) })
        expect(v.some((m) => /group "beam380-cut" \(UP-B380F x5\) is a MOVING head mounted at "truss-top"/.test(m) && /allows nothing that pans or tilts above 0.6 m/.test(m) && /opt this version out/.test(m))).toBe(true)
    })

    it('fails, in words, for a ground mover aimed across the dance floor at eye height', () => {
        const rig = structuredClone(rigs['minimal-ground'])
        rig.looks['red-room'].aims['bsw250-ground'] = { rule: 'booth-key', h: 1.6 } // the set's old "key the DJ from the side": rakes the floor at 0.7-1.6 m
        const b = { 'red-room': buildRig(rig, hall, { geometry, manifest, look: 'red-room' }) }
        const v = groundPolicyViolations({ rig, hall, library, builds: b, stage: stageOf(rig) })
        expect(v.some((m) => /look "red-room": rig-bsw250-ground-\d+ \(UP-250BSW\) fires into the dance zone at \d\.\d\d m — under the 2\.5 m audience eye height/.test(m))).toBe(true)
    })

    it('does not touch a rig that has not opted in (the existing versions are kept as they are)', () => {
        const unflagged = allRigFiles.filter((x) => !x.rig.policy)
        expect(unflagged.length).toBeGreaterThan(5)
        expect(unflagged.some((x) => x.rig.variant?.id === 'minimal-cut-movers')).toBe(true) // hung movers, by design, until the owner drops it
    })

    it('reads the mounting height by mount: floor mounts 0, the riser\'s deck 1.2 m, everything on a truss, a bridge or a tower high', () => {
        expect(mountHeight({ mount: 'column-bases' }, 1.2)).toBe(0)
        expect(mountHeight({ mount: 'booth-back', on_floor: true }, 1.2)).toBe(0)
        expect(mountHeight({ mount: 'booth-back' }, 1.2)).toBe(1.2)
        for (const m of ['truss-top', 'truss-header', 'crane-bridge', 'tower-ladder', 'x-top', 'halo', 'unknown-mount']) expect(mountHeight({ mount: m }, 1.2)).toBe(Infinity)
    })
})

describe('the two versions: what they are', () => {
    it('are in the set as candidates of Minimal and Full, generated, and leave the existing versions as they were', () => {
        expect(findVersion(spec, 'minimal-ground').candidateOf).toBe('minimal')
        expect(findVersion(spec, 'full-ground').candidateOf).toBe('full')
        for (const id of GROUND) expect(rigs[id].variant).toMatchObject({ set: spec.set, id })
        // the four versions and their variants keep their ids and order
        expect(spec.versions.map((v) => v.id)).toEqual(['minimal', 'minimal-cut-movers', 'middle', 'full'])
        expect(spec.candidates.slice(0, 2).map((c) => c.id)).toEqual(['minimal-xflat', 'minimal-xflat-heads'])
    })

    it('hang every static from the cut (as Minimal) and stand every mover, once per type, on the floor', () => {
        for (const id of GROUND) {
            const rig = rigs[id]
            const stage = stageOf(rig)
            const codes = new Set()
            for (const g of rig.groups) {
                const code = codeOf(rig, g)
                if (isMover(code, library)) {
                    codes.add(code)
                    expect(mountHeight(g, stage.deck), `${id} ${g.id}`).toBeLessThanOrEqual(0.6)
                }
                if (isLaser(code)) expect(['truss-top'], g.id).toContain(g.mount) // fixed, bolted to the cut's top chord
            }
            expect([...codes].sort()).toEqual(['UP-250BSW', 'UP-B380F', 'UP-HK1915'])
            expect(rig.truss.shape, id).toBe('slope')
            for (const s of ['cob-cut-curtain', 'par-cut-x', 'par-cut-bridge', 'par-columns-8', 'par-press-cut']) expect(rig.groups.some((g) => g.id === s), `${id} ${s}`).toBe(true)
        }
    })

    it('never hang an effect: every one is on the floor, and full-ground carries the CO2, spark and smoke', () => {
        for (const id of GROUND) for (const fx of rigs[id].effects) expect(mountHeight(fx, stageOf(rigs[id]).deck), `${id} ${fx.id}`).toBe(0)
        expect(rigs['minimal-ground'].effects.map((f) => f.fixture)).toEqual(['hazer'])
        const fx = Object.fromEntries(rigs['full-ground'].effects.map((f) => [f.fixture, f]))
        expect(Object.keys(fx).sort()).toEqual(['co2', 'hazer', 'smoke', 'spark'])
        // in the pit: past the riser (0.3 m or more from its front) and short of the barrier (1.3 m)
        for (const k of ['co2', 'spark']) {
            expect(fx[k].mount).toBe('booth-pit')
            expect(fx[k].pit_m).toBeGreaterThanOrEqual(0.3)
            expect(fx[k].pit_m).toBeLessThan(1.3)
        }
    })
})

describe('counts against the rental house\'s stock', () => {
    const STOCK = { 'UP-B380F': 18, 'UP-250BSW': 12, 'UP-HK1915': 14, 'UP-PL5403': 50, 'UP-COB200': 8, 'UP-LA40WF': 2 }
    for (const id of GROUND) {
        it(`${id}: no line is ordered beyond its stock, and the six capped codes are the owner's numbers`, () => {
            const list = read(rentalFileOf(spec.set, id)).rentalList
            for (const i of list.items.filter((x) => !x.from)) if (i.stock != null) expect(i.ordered, `${id} ${i.code}`).toBeLessThanOrEqual(i.stock)
            for (const [code, stock] of Object.entries(STOCK)) expect(list.catalogue.find((c) => c.code === code).stock, code).toBe(stock)
            const n = Object.fromEntries(list.items.map((i) => [i.code, i.ordered]))
            // "once": one kit of each mover type (B380F at the Minimal family's 13, 250BSW 6, HK1915 4) — an assumption, said in the note
            expect([n['UP-B380F'], n['UP-250BSW'], n['UP-HK1915']]).toEqual([13, 6, 4])
            expect(n['UP-LA40WF']).toBe(2)
            expect(n['UP-PL5403']).toBe(21)
            expect(n['UP-COB200']).toBe(7)
        })
    }
})

describe('every fixture in the hall, off the machinery, off the DJ riser', () => {
    const g = hall.geometry
    for (const id of GROUND) {
        it(`${id}: inside the nave and under its roof, clear of the press, the machine line and the riser`, () => {
            const rig = rigs[id]
            const stage = stageOf(rig)
            const boxes = [...machineryBoxes(hall), riserBox(rig, stage)]
            const b = builds[id]['(rest aims)']
            for (const e of b.entities.filter((x) => x.type === 'spotLight')) {
                const grp = groupOfEntity(rig, e)
                const [x, y, z] = e.components.transform.position
                expect(Math.abs(x), e.id).toBeLessThanOrEqual(g.column_inner_face_x_m)
                expect(z, e.id).toBeGreaterThan(g.far_wall_z_m)
                expect(z, e.id).toBeLessThan(g.door.z_m)
                expect(y, e.id).toBeGreaterThan(0)
                expect(y, e.id).toBeLessThan(g.truss_bottom_m)
                // the press's own PARs stand at its foot on purpose (0.3 m from its face, on the floor)
                if (grp.id === 'par-press-cut') continue
                for (const box of boxes) {
                    const inside = x >= box.x[0] - 0.1 && x <= box.x[1] + 0.1 && z >= box.z[0] - 0.1 && z <= box.z[1] + 0.1 && y >= box.y[0] && y <= box.y[1]
                    expect(inside, `${e.id} at [${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}] is inside ${box.id}`).toBe(false)
                }
            }
            // the floor movers keep 0.5 m from the machinery in plan (a hand, a cable, a fork-truck's swing)
            for (const e of b.entities.filter((x) => x.type === 'spotLight' && isMover(codeOf(rig, groupOfEntity(rig, x)), library))) {
                const [x, , z] = e.components.transform.position
                for (const box of machineryBoxes(hall)) {
                    const d = Math.hypot(Math.max(box.x[0] - x, 0, x - box.x[1]), Math.max(box.z[0] - z, 0, z - box.z[1]))
                    expect(d, `${e.id} to ${box.id}`).toBeGreaterThanOrEqual(0.5)
                }
            }
        })
    }
})

describe('the beams: up, never across the dance floor', () => {
    for (const id of GROUND) {
        it(`${id}: no ground mover's cone touches the dance zone below 2.5 m — in any look or at rest`, () => {
            const rig = rigs[id]
            const zone = zoneBox(hall, 'dance', [0, 2.5])
            for (const [look, b] of Object.entries(builds[id])) {
                for (const e of b.entities.filter((x) => x.type === 'spotLight')) {
                    const grp = groupOfEntity(rig, e)
                    if (!isMover(codeOf(rig, grp), library)) continue
                    const low = lowestInZone(e.components.transform.position, spotAimDirection(e.components.transform.rotation), e.components.light.angle, rig.classes[grp.class].reach_m, zone)
                    expect(low, `${id} / ${look} / ${e.id}`).toBeNull()
                }
            }
        })
    }

    it('the analysis file records it: no mover in any look reaches the eye zone', () => {
        const a = read(ANALYSIS_FILE)
        for (const v of Object.values(a.versions)) for (const m of Object.values(v.movers)) expect(m.looks_into_eye_zone).toEqual([])
    })
})

describe('the two lasers: fixed, and never below 3 m over anyone', () => {
    for (const id of GROUND) {
        it(`${id}: 2 UP-LA40WF, not movers, lens at 3 m or more, every beam rising and 3 m or more over every floor a person can stand on`, () => {
            const rig = rigs[id]
            const lasers = rig.groups.filter((gr) => isLaser(codeOf(rig, gr)))
            expect(lasers.reduce((s, gr) => s + gr.count, 0)).toBe(2)
            expect(isMover('UP-LA40WF', library)).toBe(false)
            const floor = { x: [-hall.geometry.column_inner_face_x_m, hall.geometry.column_inner_face_x_m], z: [stageOf(rig).front, hall.geometry.door.z_m], y: [0, 3] }
            for (const [look, b] of Object.entries(builds[id])) {
                for (const e of b.entities.filter((x) => x.type === 'spotLight' && isLaser(codeOf(rig, groupOfEntity(rig, x))))) {
                    const dir = spotAimDirection(e.components.transform.rotation)
                    expect(e.components.transform.position[1], `${look} ${e.id}`).toBeGreaterThanOrEqual(3)
                    expect(dir[1], `${look} ${e.id}`).toBeGreaterThan(0)
                    expect(lowestInZone(e.components.transform.position, dir, e.components.light.angle, 60, floor), `${look} ${e.id}`).toBeNull()
                }
            }
        })
    }

    it('says the sign-off out loud: Class 4 needs a certified laser safety officer, owed — no compliance is claimed', () => {
        for (const id of GROUND) {
            expect(rigs[id].policy.movingFixtures.lasers.signoff).toMatch(/certified laser safety officer/)
            expect(rigs[id].policy.movingFixtures.lasers.signoff).toMatch(/owed/)
            expect(JSON.stringify(rigs[id])).not.toMatch(/compliant|complies with|certified safe/i)
        }
    })
})

describe('the analysis file', () => {
    it('is what ground-movers.mjs computes (never edited by hand), and every rejected place says why', () => {
        expect(fs.readFileSync(path.join(REPO_ROOT, ANALYSIS_FILE), 'utf8')).toBe(`${JSON.stringify(analysis(), null, 4)}\n`)
        const a = read(ANALYSIS_FILE)
        expect(a.places.filter((p) => p.chosen).map((p) => p.id).sort()).toEqual(['backstage-row', 'nave-columns-between', 'nave-columns-ends', 'nave-columns-mid'])
        for (const p of a.places) {
            expect(p.why.length, p.id).toBeGreaterThan(30)
            if (p.chosen) expect(p.under_a_crane_girder, p.id).toBe(false)
            expect(p.distance_to_dance_zone_m, `${p.id}: chosen places are outside the crowd`).toBeGreaterThanOrEqual(p.chosen ? 5 : 0)
        }
    })
})
