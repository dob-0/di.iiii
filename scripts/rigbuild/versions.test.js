// @vitest-environment node
// The three rig versions of MOXIR 17.10 (RIG_BUILD.md §15): generated, safe in every look,
// underground by construction, and costed by the quote's own rule.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { REPO_ROOT } from '../place/common.mjs'
import { LASER_MIN_HEIGHT_M, RIG_PREFIX, buildRig, groupAxis, performerBox, stageFrame } from '../place/rig-lib.mjs'
import { readGeometry } from '../place/fixtures-glb.mjs'
import { spotAimDirection } from '../../src/project/viewport/spotLightAim.js'
import { allVersions, costing, generated, rentalFileOf, rigFileOf, VERSIONS_FILE } from './versions.mjs'
import { parsePrices, specWithPrivatePrices, withPrivatePrices } from './privatePrices.mjs'
import { rigLooksFrom } from './looks.mjs'
import { loadLibrary } from './library.mjs'
import { typeById, typeIdOf } from '../../src/rigbuild/fixtureTypes.js'

const read = (f) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'))
const spec = read(VERSIONS_FILE)
// the hall the versions are hung in: the crane parked over the DJ (versions file `hall`)
const hall = read(spec.hall)
const manifest = read('scripts/place/fixtures/fixtures.json')
const performerBoxZ = (rig, stage) => performerBox(rig, stage).z
const geometry = Object.fromEntries(Object.keys(manifest.kinds).map((k) => [k, readGeometry(k)]))
const rigs = Object.fromEntries(spec.versions.map((v) => [v.id, read(rigFileOf(spec.set, v.id))]))
const lists = Object.fromEntries(spec.versions.map((v) => [v.id, read(rentalFileOf(spec.set, v.id)).rentalList]))
const COMMERCIAL = /co2|spark|confetti|butterfly/i
const library = loadLibrary()

describe('the version files', () => {
    it('are what versions.mjs makes from the versions file and the base rig (never edited by hand)', () => {
        for (const [file, text] of Object.entries(generated())) expect(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8'), file).toBe(text)
    })

    it('are four — the cut simple and full, then middle < full — in one hall with one booth', () => {
        expect(spec.versions.map((v) => v.id)).toEqual(['minimal', 'minimal-cut-movers', 'middle', 'full'])
        const n = (id) => rigs[id].groups.reduce((s, g) => s + g.count, 0)
        expect(n('middle')).toBeLessThan(n('full'))
        // Minimal is the cut, simple: the rental house's NON-moving lights only (owner, 2026-09-29)
        const moving = (id) => rigs[id].groups.filter((g) => typeById(library, typeIdOf(rigs[id].classes[g.class].code))?.pan_tilt_deg)
        expect(moving('minimal')).toEqual([])
        expect(new Set(rigs.minimal.groups.map((g) => rigs.minimal.classes[g.class].code))).toEqual(new Set(['UP-PL5403', 'UP-COB200']))
        expect(moving('minimal-cut-movers').length).toBeGreaterThan(0)
        const base = read(`scripts/place/rigs/${spec.base}`)
        for (const rig of Object.values(rigs)) {
            expect(rig.stage).toEqual(base.stage)
            expect(rig.opening).toEqual(spec.craneOpening) // one camera for the set: the crane rig's (all three hang from the crane)
            expect(rig.variant.set).toBe(spec.set)
        }
    })

    it('carry none of the commercial vocabulary: no CO2, no sparks, no confetti — and haze in every one', () => {
        for (const [id, rig] of Object.entries(rigs)) {
            expect(Object.values(rig.classes).map((c) => c.fixture).join(' '), id).not.toMatch(COMMERCIAL)
            expect((rig.effects || []).map((f) => f.fixture).join(' '), id).not.toMatch(COMMERCIAL)
            expect(lists[id].items.map((i) => i.code).filter((c) => ['UP-Q108S', 'UP-YH600F', 'UP-HD210'].includes(c)), id).toEqual([])
            expect(rig.effects.some((f) => f.fixture === 'hazer'), id).toBe(true)
            // a strobe in every version but the vendor-only one (the rental house has none)
            if (id !== 'minimal') expect(rig.groups.some((g) => rig.classes[g.class].fixture === 'strobe'), id).toBe(true)
        }
        expect(rigs.full.groups.some((g) => rigs.full.classes[g.class].fixture === 'blinder')).toBe(true)
    })

    // Owner, 2026-09-28 23:1x: no stage, no towers — only the DJ stand; the crane parked over
    // the DJ carries the truss on chains ("ok take complimentary": one line).
    it('hang from the crane parked over the DJ: no towers, one line, its load and the sign-off owed written down', () => {
        const crane = hall.geometry.cranes.find((c) => Math.abs(c.z_m - 4.8) < 0.01)
        expect(crane, 'the entry-end crane rolled over the DJ').toBeTruthy()
        expect(hall.geometry.cranes).toHaveLength(2) // moved, not duplicated
        for (const [id, rig] of Object.entries(rigs)) {
            expect(rig.truss.kind, id).toBe('crane-hung')
            expect(rig.groups.some((g) => /tower/.test(g.mount)), id).toBe(false)
            if (rig.truss.shape === 'slope') continue // the cut: cut.test.js
            const stage = stageFrame(rig, hall)
            expect(stage.trussZ, id).toBe(crane.z_m)
            const dj = performerBoxZ(rig, stage)
            expect(crane.z_m, id).toBeGreaterThanOrEqual(dj[0])
            expect(crane.z_m, id).toBeLessThanOrEqual(dj[1])
            const built = buildRig(rig, hall, { geometry, manifest })
            expect(built.entities.some((e) => /truss-tower/.test(e.id)), id).toBe(false)
            const line = built.entities.find((e) => e.id === `${RIG_PREFIX}truss-header`)
            expect(line.components.transform.position[1], id).toBeCloseTo(rig.truss.trim_m, 6)
            expect(line.components.transform.scale[0], id).toBe(8)
            expect(rig.truss.pieces_m.reduce((a, b) => a + b, 0), id).toBe(8)
            expect(built.entities.filter((e) => /hoist-\d+$/.test(e.id)), id).toHaveLength(2)
            const load = rig.truss.rigging.load
            expect(load.points, id).toBe(2)
            expect(load.total_kg[0], id).toBeGreaterThan(load.lamps_kg)
            expect(rig.truss.rigging.signoff, id).toMatch(/rigging sign-off owed \(crane rated load, lock-out, hoists \+ safety steels\)/)
        }
        // Middle: the flat 8 m line on 2 points, as before the cut
        expect(rigs.middle.truss.rigging.load.points).toBe(2)
    })

    it('paint with the palette only — cold white, deep red, amber, the blinders\' warm white', () => {
        const allowed = new Set(Object.keys(spec.palette.colours))
        for (const [id, rig] of Object.entries(rigs)) {
            for (const [look, l] of Object.entries(rig.looks)) for (const c of Object.values(l.colours)) expect(allowed.has(c), `${id} ${look} ${c}`).toBe(true)
        }
    })

    it('become view C\'s looks, levels included', () => {
        for (const [id, rig] of Object.entries(rigs)) {
            const looks = rigLooksFrom(rig, rigFileOf(spec.set, id))
            expect(looks.looks.map((l) => l.id)).toEqual(Object.keys(spec.looks))
            expect(looks.looks.find((l) => l.id === 'strobe-hit').levels).toBeTruthy()
        }
    })
})

// the set's own, its comparison variants (§15.9) and its candidates (§15.10) pass the same safety tests
for (const v of allVersions(spec)) {
    describe(`${v.id}: the safety tests, in every look`, () => {
        const rig = rigs[v.id] || read(rigFileOf(spec.set, v.id))
        const stage = stageFrame(rig, hall)
        for (const look of Object.keys(rig.looks)) {
            const built = buildRig(rig, hall, { geometry, manifest, look })
            const lamps = built.entities.filter((e) => e.type === 'spotLight')

            it(`${look}: hangs every fixture, refuses none, fires nothing into a crane or through the DJ, asks no head past its travel`, () => {
                expect(built.summary.refused).toEqual([])
                expect(built.summary.clashes).toEqual([])
                expect(built.summary.unreachable).toEqual([])
                expect(lamps).toHaveLength(rig.groups.reduce((s, g) => s + g.count, 0))
            })

            it(`${look}: keeps every laser at least ${LASER_MIN_HEIGHT_M} m up and rising, never into the audience plane`, () => {
                for (const e of lamps.filter((x) => rig.classes[rig.groups.find((g) => x.id.startsWith(`${RIG_PREFIX}${g.id}-`)).class].fixture === 'laser')) {
                    expect(e.components.transform.position[1]).toBeGreaterThanOrEqual(LASER_MIN_HEIGHT_M)
                    expect(spotAimDirection(e.components.transform.rotation)[1]).toBeGreaterThanOrEqual(0)
                }
            })

            // the browser budget (rig-lib budget.realLights) — unless the version states that every
            // lamp is real (`realLightsAll`, MOXIR Known and Known · full, 2026-10-01), and then it is
            if (rig.budget?.realLightsAll) {
                it(`${look}: lights the room with every lamp real, as its version states`, () => {
                    expect(built.summary.real).toBe(lamps.length)
                })
            } else {
                it(`${look}: lights the room with 8 real lamps at most`, () => {
                    expect(built.summary.real).toBeLessThanOrEqual(8)
                })
            }

            it(`${look}: is mirror-symmetric about the nave centre line (the press's own lamps and a solo aside)`, () => {
                const near = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 0.02)
                const vec = (e) => [...e.components.transform.position, ...spotAimDirection(e.components.transform.rotation), e.components.light.intensity > 0 ? 1 : 0]
                for (const g of rig.groups) {
                    if (g.symmetric === false) continue
                    const axis = groupAxis(g, stage)
                    expect(axis).toBe(0)
                    const own = lamps.filter((e) => e.id.startsWith(`${RIG_PREFIX}${g.id}-`))
                    const solo = Number.isInteger(rig.looks[look].aims[g.id]?.solo)
                    const at = g.symmetric === 'positions' ? (e) => e.components.transform.position.slice(0, 1).map(Math.abs) : null
                    const mirrored = ([x, y, z, dx, dy, dz, on]) => [2 * axis - x, y, z, -dx, dy, dz, on]
                    const orphans = own.filter((e) => (at
                        ? !own.some((o) => Math.abs(Math.abs(o.components.transform.position[0]) - Math.abs(e.components.transform.position[0])) < 0.05)
                        : !own.some((o) => near(solo ? vec(o).slice(0, 6) : vec(o), (solo ? mirrored(vec(e)).slice(0, 6) : mirrored(vec(e))))))).map((e) => e.id)
                    expect(orphans, `${g.id}`).toEqual([])
                }
            })
        }
    })
}

describe('the cost, by the quote\'s own rule', () => {
    // The rental house's rates are private (not in the public repo). These are INVENTED: 10/day per
    // code and a package at 100/day, read through the same csv loader the owner's machine uses.
    const fakeCsv = (extra) => ['model,amd_1_night', ...Object.values(lists)[0].catalogue.map((c) => `${c.code},10`), ...extra].join('\n')
    const prices = parsePrices(fakeCsv(spec.packages.items.map((p) => `${p.id},100`)))

    it('says nothing, and sums nothing, without the private prices — never a partial sum', () => {
        for (const v of spec.versions) {
            const c = costing({ spec, list: lists[v.id] })
            expect(c.priced).toBe(false)
            expect(c.best).toBeNull()
            expect(c.options.every((o) => o.perDay === null && Object.values(o.byDays).every((d) => d === null))).toBe(true)
            expect(c.cheaperThanALaCarte).toEqual([])
            // what the cost does NOT need still comes out: what a package would leave unused
            expect(c.options.find((o) => o.id === 'outdoor-full').unused).toBeInstanceOf(Array)
        }
    })

    it('with the private prices, sums à la carte and by package, with the day rule and what is unused', () => {
        for (const v of spec.versions) {
            const c = costing({ spec: specWithPrivatePrices(spec, prices), list: withPrivatePrices(lists[v.id], prices) })
            const alc = c.options.find((o) => o.id === 'a-la-carte')
            const outdoor = c.options.find((o) => o.id === 'outdoor-full')
            expect(c.priced).toBe(true)
            // à la carte is Σ rate × quantity for the rental lines (10 each here)
            expect(alc.perDay).toBe(10 * lists[v.id].items.filter((i) => !i.from).reduce((s, i) => s + i.ordered, 0))
            // a package covers up to its count of a code; the package price is added, the rest à la carte
            const covered = Object.entries(spec.packages.items[0].covers).reduce((s, [code, n]) => s + Math.min(n, lists[v.id].items.find((i) => i.code === code)?.ordered || 0), 0)
            expect(outdoor.perDay).toBe(100 + alc.perDay - 10 * covered)
            expect(outdoor.unused.length).toBeGreaterThan(0)
            // two days = 1.5 day-rates
            expect(alc.byDays[2]).toBe(alc.perDay * 1.5)
        }
        expect(costing({ spec: specWithPrivatePrices(spec, prices), list: withPrivatePrices(lists.minimal, prices) }).options.find((o) => o.id === 'outdoor-full').unused).toEqual(expect.arrayContaining([{ code: 'UP-Q108S', n: 6 }]))
    })

    it('lists strobes, blinders and hazers as other-supplier lines, each with 2-3 named products and a source', () => {
        for (const code of ['EXT-STROBE', 'EXT-BLINDER', 'EXT-HAZER']) {
            const o = spec.otherSuppliers[code]
            expect(o.options.length).toBeGreaterThanOrEqual(2)
            expect(o.options.length).toBeLessThanOrEqual(3)
            for (const p of o.options) expect(p.url).toMatch(/^https:\/\//)
        }
        for (const list of Object.values(lists)) for (const i of list.items.filter((x) => x.code.startsWith('EXT-'))) expect(i.from).toBe('other')
    })
})
