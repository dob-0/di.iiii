// The Platina rig plan (2026-11-11): the rig file matches the offer's counts and the 11-11 patch plan, and nothing collides.
// Written by scripts/place/platina_rig.py from the 11-10 plot pictures; this guards the result (no browser, no server).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (f) => JSON.parse(readFileSync(join(here, 'rigs', f), 'utf8'))
const rig = read('platina-rig-2026-11-11.json')
const plan = read('platina-2026-11-11.patch.json')
const rental = JSON.parse(readFileSync(join(here, '..', 'rigbuild', 'rentals', 'platina-2026-11-11.json'), 'utf8')).rentalList
const count = (type) => rig.fixtures.filter((f) => f.type === type).length
const box = (p, s, base) => {
    const cy = base ? p[1] + s[1] / 2 : p[1]
    return [[p[0] - s[0] / 2, cy - s[1] / 2, p[2] - s[2] / 2], [p[0] + s[0] / 2, cy + s[1] / 2, p[2] + s[2] / 2]]
}
const overlap = (a, b, tol) => [0, 1, 2].every((i) => a[0][i] + tol < b[1][i] && a[1][i] - tol > b[0][i])

describe('Platina rig plan 2026-11-11', () => {
    it('has the offer counts: 8 K10, 8 K15, 12 XP-16R, 24 Pixel Line, 2 hazers', () => {
        const offer = Object.fromEntries(rental.items.map((i) => [i.type, i.ordered]))
        expect([count('cp-aleda-beye-k10'), count('cp-hy-beye-k15'), count('acme-xp16r-bsw'), count('acme-pixel-line-ip'), count('magmatic-magma-prime')]).toEqual([8, 8, 12, 24, 2])
        for (const [t, n] of Object.entries(rig.kit)) expect(offer[t]).toBe(n)
        expect(rig.fixtures).toHaveLength(54)
    })

    it('gives every lamp a unique id and a unique universe+address that is the patch plan\'s own address', () => {
        expect(new Set(rig.fixtures.map((f) => f.id)).size).toBe(54)
        expect(new Set(rig.fixtures.map((f) => `${f.dmx.universe}/${f.dmx.address}`)).size).toBe(54)
        const blocks = Object.fromEntries(plan.universes.flatMap((u) => u.blocks.map((b) => [b.select.group, { u: u.universe, b }])))
        const seen = {}
        for (const f of rig.fixtures) {
            const { u, b } = blocks[f.group]
            const i = seen[f.group] ?? 0
            seen[f.group] = i + 1
            expect(f.dmx.universe).toBe(u)
            expect(f.dmx.fixture).toBe(b.fixture + i)
            expect(f.dmx.address).toBe(b.start + i * plan.modes[b.select.type].pitch)
            expect(f.type).toBe(b.select.type)
        }
        for (const [g, { b }] of Object.entries(blocks)) expect(seen[g]).toBe(b.units)
    })

    it('says measured / from-plan-words / PROPOSED and a source for every item, PROPOSED for XP-16R and hazers', () => {
        for (const x of [...rig.fixtures, ...rig.solids]) {
            expect(x.status, x.id).toMatch(/measured|from-plan-words|PROPOSED/)
            expect(x.source, x.id).toBeTruthy()
        }
        expect(rig.fixtures.filter((f) => /xp16r|hazer/.test(f.id)).every((f) => f.status === 'PROPOSED')).toBe(true)
        expect(rig.fixtures.every((f) => f.profile && f.profile.basis === 'ASSUMED')).toBe(true)
    })

    it('measures the plot on a 1 m grid: truss 8 m, bar stacks 3 m, screen 4.0 x 2.5 m', () => {
        const p = rig.calibration.proofs_m
        expect(p.top_truss_over_len_m).toBeCloseTo(8, 0)
        expect(p.front_bar_stack_m).toBeCloseTo(3, 1)
        expect(p.side_bar_stack_m).toBeCloseTo(3, 1)
        expect(p.front_screen_w_m).toBeCloseTo(4, 1)
        expect(p.front_screen_h_m).toBeCloseTo(2.5, 1)
        const scr = rig.solids.find((s) => s.id === 'platina-screen')
        expect(scr.s[0]).toBeCloseTo(4, 1)
        expect(scr.s[1]).toBeCloseTo(2.5, 1)
    })

    it('has 0 leaks: no lamp body inside a solid or another lamp, no home beam through the screen', () => {
        const solids = rig.solids.filter((s) => !/deck|wing|riser/.test(s.id)).map((s) => box(s.p, s.s, s.kind === 'box'))
        const bodies = rig.fixtures.map((f) => box(f.p, f.size_m, false))
        bodies.forEach((b, i) => {
            solids.forEach((s) => expect(overlap(b, s, 0.03), rig.fixtures[i].id).toBe(false))
            for (let j = i + 1; j < bodies.length; j++) expect(overlap(b, bodies[j], 0.01), `${rig.fixtures[i].id} / ${rig.fixtures[j].id}`).toBe(false)
        })
        expect(rig.checks.geometry.leaks).toEqual([])
        // every lamp stays above the deck or on it
        rig.fixtures.forEach((f) => expect(f.p[1] - f.size_m[1] / 2).toBeGreaterThan(rig.solids.find((s) => s.id === 'platina-deck').s[1] - 0.05))
    })

    it('lists what the plot has and the offer has not (3 audience-side K10, 7 Sharpy) as plot_only, not built', () => {
        expect(rig.plot_only.k10_audience_side.count).toBe(3)
        expect(rig.plot_only.sharpy.count).toBe(7)
        expect(rig.fixtures.some((f) => /sharpy/i.test(f.type))).toBe(false)
    })
})
