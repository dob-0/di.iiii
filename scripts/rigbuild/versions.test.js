// @vitest-environment node
// The three rig versions of MOXIR 17.10 (RIG_BUILD.md §15): generated, safe in every look,
// underground by construction, and costed by the quote's own rule.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { REPO_ROOT } from '../place/common.mjs'
import { LASER_MIN_HEIGHT_M, RIG_PREFIX, buildRig, groupAxis, stageFrame } from '../place/rig-lib.mjs'
import { readGeometry } from '../place/fixtures-glb.mjs'
import { spotAimDirection } from '../../src/project/viewport/spotLightAim.js'
import { costing, generated, rentalFileOf, rigFileOf, VERSIONS_FILE } from './versions.mjs'
import { rigLooksFrom } from './looks.mjs'

const read = (f) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'))
const spec = read(VERSIONS_FILE)
const hall = read('scripts/place/rigs/moxir-hall-2026-09-28.hall.json')
const manifest = read('scripts/place/fixtures/fixtures.json')
const geometry = Object.fromEntries(Object.keys(manifest.kinds).map((k) => [k, readGeometry(k)]))
const rigs = Object.fromEntries(spec.versions.map((v) => [v.id, read(rigFileOf(spec.set, v.id))]))
const lists = Object.fromEntries(spec.versions.map((v) => [v.id, read(rentalFileOf(spec.set, v.id)).rentalList]))
const COMMERCIAL = /co2|spark|confetti|butterfly/i

describe('the version files', () => {
    it('are what versions.mjs makes from the versions file and the base rig (never edited by hand)', () => {
        for (const [file, text] of Object.entries(generated())) expect(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8'), file).toBe(text)
    })

    it('are three, minimal < middle < full, in one hall with one booth', () => {
        expect(spec.versions.map((v) => v.id)).toEqual(['minimal', 'middle', 'full'])
        const n = (id) => rigs[id].groups.reduce((s, g) => s + g.count, 0)
        expect(n('minimal')).toBeLessThan(n('middle'))
        expect(n('middle')).toBeLessThan(n('full'))
        const base = read(`scripts/place/rigs/${spec.base}`)
        for (const rig of Object.values(rigs)) {
            expect(rig.stage).toEqual(base.stage)
            expect(rig.opening).toEqual(base.opening)
            expect(rig.variant.set).toBe(spec.set)
        }
    })

    it('carry none of the commercial vocabulary: no CO2, no sparks, no confetti — and haze in every one', () => {
        for (const [id, rig] of Object.entries(rigs)) {
            expect(Object.values(rig.classes).map((c) => c.fixture).join(' '), id).not.toMatch(COMMERCIAL)
            expect((rig.effects || []).map((f) => f.fixture).join(' '), id).not.toMatch(COMMERCIAL)
            expect(lists[id].items.map((i) => i.code).filter((c) => ['UP-Q108S', 'UP-YH600F', 'UP-HD210'].includes(c)), id).toEqual([])
            expect(rig.effects.some((f) => f.fixture === 'hazer'), id).toBe(true)
            expect(rig.groups.some((g) => rig.classes[g.class].fixture === 'strobe'), id).toBe(true)
        }
        expect(rigs.full.groups.some((g) => rigs.full.classes[g.class].fixture === 'blinder')).toBe(true)
        expect(rigs.minimal.truss.kind).toBe('none')
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

for (const v of spec.versions) {
    describe(`${v.id}: the safety tests, in every look`, () => {
        const rig = rigs[v.id]
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

            it(`${look}: lights the room with 8 real lamps at most`, () => {
                expect(built.summary.real).toBeLessThanOrEqual(8)
            })

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
    it('says where the rental house\'s complete systems are cheaper than à la carte, even with parts unused', () => {
        for (const v of spec.versions) {
            const c = costing({ spec, list: lists[v.id] })
            const alc = c.options.find((o) => o.id === 'a-la-carte')
            const outdoor = c.options.find((o) => o.id === 'outdoor-full')
            // à la carte is Σ rate × quantity for the rental lines
            expect(alc.perDay).toBe(lists[v.id].items.filter((i) => !i.from).reduce((s, i) => s + i.rate * i.ordered, 0))
            // the 205,000 outdoor package undercuts à la carte for every version (18 beams alone are 360,000)
            expect(outdoor.perDay).toBeLessThan(alc.perDay)
            expect(outdoor.unused.length).toBeGreaterThan(0)
            // two days = 1.5 day-rates
            expect(alc.byDays[2]).toBe(alc.perDay * 1.5)
        }
        expect(costing({ spec, list: lists.minimal }).options.find((o) => o.id === 'outdoor-full').unused).toEqual(expect.arrayContaining([{ code: 'UP-Q108S', n: 6 }]))
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
