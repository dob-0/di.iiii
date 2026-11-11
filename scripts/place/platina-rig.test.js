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

    it('the hung rows say hung, the deck row does not; every beam lamp rests leaning toward the audience, the rows fanned', () => {
        const xp = rig.fixtures.filter((f) => /xp16r/.test(f.id))
        const hung = xp.filter((f) => f.hung === true)
        const deck = xp.filter((f) => f.hung !== true)
        expect([hung.length, deck.length]).toEqual([7, 5])
        expect(rig.fixtures.filter((f) => f.type === 'cp-aleda-beye-k10').every((f) => f.hung === true)).toBe(true)
        expect(rig.fixtures.filter((f) => f.type === 'cp-hy-beye-k15').some((f) => f.hung)).toBe(false)
        // the beam of rotation [rx, 0, rz] (spotLightAim.js: local forward is straight down, Rz then Rx)
        const dir = ([rx, , rz]) => [Math.sin(rz), -Math.cos(rz) * Math.cos(rx), -Math.cos(rz) * Math.sin(rx)]
        for (const f of hung) { const d = dir(f.r); expect(d[1], f.id).toBeLessThan(0); expect(d[2], f.id).toBeGreaterThan(0.2) }
        for (const f of deck) { const d = dir(f.r); expect(d[1], f.id).toBeGreaterThan(0); expect(d[2], f.id).toBeGreaterThan(0.2) }
        for (const row of [hung, deck]) {
            const byX = [...row].sort((a, b) => a.p[0] - b.p[0])
            expect(dir(byX[0].r)[0]).toBeLessThan(-0.3)
            expect(dir(byX[byX.length - 1].r)[0]).toBeGreaterThan(0.3)
        }
    })

    it('no lamp is in the air: a standing lamp has a solid or a lamp right under its foot, a hung one a truss right above', () => {
        const top = (s) => s.p[1] + s.s[1]
        const over = (f, s, pad) => Math.abs(f.p[0] - s.p[0]) <= s.s[0] / 2 + pad && Math.abs(f.p[2] - s.p[2]) <= s.s[2] / 2 + pad
        for (const f of rig.fixtures) {
            const foot = f.p[1] - f.size_m[1] / 2, head = f.p[1] + f.size_m[1] / 2
            if (f.hung) {
                const truss = rig.solids.filter((s) => s.kind === 'truss' && over(f, s, 0.3))
                expect(truss.some((s) => Math.abs((s.p[1] - s.s[1] / 2) - head) < 0.15), `${f.id} hangs under nothing`).toBe(true)
                continue
            }
            const onSolid = rig.solids.some((s) => s.kind === 'box' && over(f, s, 0.05) && Math.abs(top(s) - foot) < 0.06)
            const onLamp = rig.fixtures.some((g) => g !== f && Math.abs(g.p[0] - f.p[0]) < 0.05 && Math.abs(g.p[2] - f.p[2]) < 0.05 && Math.abs(g.p[1] + g.size_m[1] / 2 - foot) < 0.06)
            expect(onSolid || onLamp, `${f.id} stands on nothing (foot at ${foot.toFixed(2)} m)`).toBe(true)
        }
    })

    it('says measured / from-plan-words / PROPOSED and a source for every item, PROPOSED for XP-16R and hazers', () => {
        for (const x of [...rig.fixtures, ...rig.solids]) {
            expect(x.status, x.id).toMatch(/measured|from-plan-words|PROPOSED/)
            expect(x.source, x.id).toBeTruthy()
        }
        expect(rig.fixtures.filter((f) => /xp16r|hazer/.test(f.id)).every((f) => f.status === 'PROPOSED')).toBe(true)
        // since 2026-11-11 every unit is its real library type (no stand-in), with the maker's limits where the base has them
        expect(rig.fixtures.every((f) => f.profile && f.profile.library === f.type && !f.profile.stand_in && /^EXACT/.test(f.profile.basis))).toBe(true)
        expect(rig.fixtures.filter((f) => /xp16r/.test(f.id)).every((f) => f.profile.zoom_deg[0] === 3 && f.profile.pan_tilt_deg[1] === 270 && f.size_m[1] === 0.58)).toBe(true)
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

    it('every solid is opaque and there is a floor: light stops at the first surface (owner N3835)', () => {
        expect(rig.solids.every((s) => s.opaque === true)).toBe(true)
        const floor = rig.solids.find((s) => s.id === 'platina-floor')
        expect(floor.p[1] + floor.s[1]).toBeCloseTo(0, 5)
        expect(floor.status).toBe('PROPOSED')
    })

    it('lists what the plot has and the offer has not (3 audience-side K10, 7 Sharpy) as plot_only, not built', () => {
        expect(rig.plot_only.k10_audience_side.count).toBe(3)
        expect(rig.plot_only.sharpy.count).toBe(7)
        expect(rig.fixtures.some((f) => /sharpy/i.test(f.type))).toBe(false)
    })
})
