// @vitest-environment node
// THE CUT (RIG_BUILD.md §15.8): one straight 12 m line sloped 15° under the crane bridge,
// 3 bridled picks, tie-offs, the sway rule — and every lamp on it reachable by the looks.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { REPO_ROOT } from '../place/common.mjs'
import { RIG_PREFIX, bottomChordAt, buildRig, linePoint, stageFrame } from '../place/rig-lib.mjs'
import { readGeometry } from '../place/fixtures-glb.mjs'
import { piecesFromRigBoxes } from './load-plot.mjs'
import { moxirDocument } from './moxir.mjs'
import { loadLibrary } from './library.mjs'
import { rigLooksFrom } from './looks.mjs'
import { swayBreaches } from './sway.mjs'
import { rentalFileOf, rigFileOf, threePointReactions, VERSIONS_FILE } from './versions.mjs'
import { libraryWithShow } from '../../src/rigbuild/rental.js'
import { venuePlanFromHall } from '../../src/rigbuild/venuePlan.js'
import { lookPoses } from '../../src/rigbuild/looks.js'
import { trussRuns, piecesOf } from '../../src/rigbuild/plotGeometry.js'
import { typeById, typeIdOf } from '../../src/rigbuild/fixtureTypes.js'
import { turnBasis } from '../../src/rigbuild/mvr.js'

const read = (f) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, f), 'utf8'))
const spec = read(VERSIONS_FILE)
const hall = read(spec.hall)
const manifest = read('scripts/place/fixtures/fixtures.json')
const geometry = Object.fromEntries(Object.keys(manifest.kinds).map((k) => [k, readGeometry(k)]))
const types = read('src/rigbuild/types/moxir.json').types
const CUT = ['minimal', 'minimal-cut-movers']
const rigs = Object.fromEntries(CUT.map((id) => [id, read(rigFileOf(spec.set, id))]))

describe('a beam on three supports (the load split)', () => {
    it('gives the textbook 3/8 · 10/8 · 3/8 of w·L on two equal spans', () => {
        const w = 10
        const L = 5
        const r = threePointReactions({ supports: [0, L, 2 * L], udl: [{ from: 0, to: 2 * L, kgm: w }] })
        expect(r.kg[0]).toBeCloseTo((3 / 8) * w * L, 1)
        expect(r.kg[1]).toBeCloseTo((10 / 8) * w * L, 1)
        expect(r.kg[2]).toBeCloseTo((3 / 8) * w * L, 1)
    })
    it('puts a point load on its own support entirely there', () => {
        const r = threePointReactions({ supports: [0, 4, 9], loads: [{ x: 4, kg: 50 }] })
        expect(r.kg[1]).toBeCloseTo(50, 1)
        expect(Math.abs(r.kg[0]) + Math.abs(r.kg[2])).toBeLessThan(0.2)
    })
})

for (const id of CUT) {
    const rig = rigs[id]
    const t = rig.truss
    describe(`${id}: the cut`, () => {
        const stage = stageFrame(rig, hall)
        it('is one straight 12 m line of 4 × 3 m, sloped 15°, low house left and high house right, under the bridge', () => {
            expect(t.shape).toBe('slope')
            expect(t.width_m).toBe(12)
            expect(t.pieces_m).toEqual([3, 3, 3, 3])
            expect(t.slope_deg).toBeGreaterThanOrEqual(15)
            expect(t.ends[0].x_m).toBeLessThan(0)
            expect(t.ends[1].bottom_chord_m - t.ends[0].bottom_chord_m).toBeCloseTo(12 * Math.sin((15 * Math.PI) / 180), 1)
            expect(stage.trussZ).toBe(4.8)
            // between the nave columns (inner faces ±11.6) with room for the tie-offs
            expect(Math.abs(t.ends[0].x_m)).toBeLessThan(hall.geometry.column_inner_face_x_m - 3)
            expect(t.ends[1].x_m).toBeLessThan(hall.geometry.column_inner_face_x_m - 3)
        })
        it('hangs on 3 picks, each a bridle within 120° with the hoist at its shortest drop, a safety steel, and a tie-off at each end', () => {
            const built = buildRig(rig, hall, { geometry, manifest })
            const ids = built.entities.map((e) => e.id)
            expect(t.rigging.picks).toHaveLength(3)
            for (const [i, p] of t.rigging.picks.entries()) {
                expect(p.bridle_included_deg).toBeLessThanOrEqual(120)
                expect(p.apex_m - p.top_chord_m).toBeCloseTo(t.rigging.drop_m, 2)
                for (const part of ['bridle-a', 'bridle-b', 'chain', 'steel']) expect(ids).toContain(`${RIG_PREFIX}hoist-${i + 1}-${part}`)
            }
            expect(ids).toContain(`${RIG_PREFIX}tieoff-hl`)
            expect(ids).toContain(`${RIG_PREFIX}tieoff-hr`)
            // the tie-off to house right passes UNDER the crane runway beam on the column line
            expect(t.rigging.tieoffs.find((x) => x.id === 'hr').to_m[1]).toBeLessThan(hall.geometry.runway_bottom_m)
            // the line box is the pieces' line: its bottom chord is the trim over the axis
            expect(bottomChordAt(stage, 0)).toBeCloseTo(t.trim_m, 6)
        })
        it('carries its load on three positive picks that add up to the line, the sign-off owed written', () => {
            const L = t.rigging.load
            expect(L.per_point_kg.every((k) => k > 0)).toBe(true)
            expect(Math.abs(L.per_point_kg.reduce((a, b) => a + b, 0) - L.total_kg[0])).toBeLessThanOrEqual(2)
            expect(L.truss_kg[0]).toBeCloseTo(75.6, 1) // 4 × Prolyte H30V-L300 at 18.9 kg
            expect(t.rigging.signoff).toMatch(/rigging sign-off owed \(crane rated load, lock-out, hoists \+ safety steels\)/)
        })
        it('clears raised hands at its lowest point and the DJ\'s raised hands over the riser', () => {
            expect(t.clearance.over_raised_hands_m).toBeGreaterThan(0.5)
            expect(t.clearance.over_dj_raised_hands_m).toBeGreaterThan(1)
        })
        it('keeps the sway rule: every head on the line moves in 4 s or more, and a fixed lamp keeps one focus in every look', () => {
            const show = read(`scripts/place/rigs/${spec.set}-${id}.show.json`)
            expect(swayBreaches({ rig, show, types })).toEqual([])
            expect(t.motion.min_move_s).toBe(4)
            expect(t.motion.periods_s[0]).toBeGreaterThan(1)
            // a PAR, a COB, a strobe has no pan/tilt: its aim is set once on the clamp
            for (const g of rig.groups) {
                const type = types.find((x) => x.code === rig.classes[g.class].code)
                if (type?.pan_tilt_deg) continue
                const aims = new Set(Object.values(rig.looks).map((l) => JSON.stringify({ ...l.aims[g.id], solo: undefined })))
                expect(aims.size, g.id).toBe(1)
            }
        })
        it('draws each lamp on the line at its place along the slope', () => {
            const built = buildRig(rig, hall, { geometry, manifest })
            for (const g of rig.groups.filter((x) => x.mount === 'truss-top' || x.mount === 'truss-header')) {
                const bodies = built.fixtures.filter((f) => new RegExp(`^${g.id}-\\d+$`).test(f.id))
                expect(bodies.length, g.id).toBe(g.count)
            }
            // the top of the line at the high pick is where the drop math put it
            const hi = t.rigging.picks[2]
            expect(linePoint(stage, hi.u_m, 'top')[1]).toBeCloseTo(hi.top_chord_m, 2)
        })
        it('reaches every lamp from the looks: the pieces lay one sloped run and every lamp sits on one of its slots', () => {
            const library = libraryWithShow(loadLibrary(), read(rentalFileOf(spec.set, id)).rentalList)
            const { document } = moxirDocument({ rig, hall, library })
            const pieces = piecesFromRigBoxes(document.entities)
            const replaced = new Set(pieces.map((p) => p.replaces).filter(Boolean))
            const entities = [
                ...document.entities.filter((e) => !replaced.has(e.id)),
                ...pieces.map((p) => ({ id: p.id, type: 'model', name: p.name, components: { transform: { position: p.position, rotation: [0, p.yaw, p.roll || 0], scale: [1, 1, 1] }, piece: { kind: p.kind } } })),
                { id: 'place-hall', type: 'group', components: { venuePlan: venuePlanFromHall(hall, { name: 'MOXIR' }) } }
            ]
            const runs = trussRuns(piecesOf(entities))
            expect(runs).toHaveLength(1)
            expect(runs[0].length3).toBeCloseTo(12, 2)
            expect(runs[0].slopeDeg).toBeCloseTo(t.slope_deg, 1)
            const looks = rigLooksFrom(rig, rigFileOf(spec.set, id))
            const lamps = entities.filter((e) => e.type === 'spotLight' && e.components?.fixture)
            for (const look of looks.looks) {
                const poses = lookPoses({ entities, library, lookId: look.id, rigLooks: looks })
                const missing = lamps.filter((e) => !poses.has(e.id)).map((e) => e.id)
                expect(missing, look.id).toEqual([])
            }
        })
        it('turns its pieces onto the slope in the MVR too', () => {
            const th = (t.slope_deg * Math.PI) / 180
            const b = turnBasis([0, 0, th])
            // the piece's length axis rises in MVR z (the room's y) by sin θ
            expect(b.u[2]).toBeCloseTo(Math.sin(th), 6)
            expect(b.u[0]).toBeCloseTo(Math.cos(th), 6)
            expect(turnBasis([0, 0.3, 0])).toEqual({ u: [Math.cos(0.3), Math.sin(0.3), 0], v: [-Math.sin(0.3), Math.cos(0.3), 0], w: [0, 0, 1] })
        })
    })
}

describe('the cut, simple: what the rental house has, and nothing that moves', () => {
    it('uses only UP-PL5403 and UP-COB200 within their stock (50 and 8)', () => {
        const list = read(rentalFileOf(spec.set, 'minimal')).rentalList
        const lights = list.items.filter((i) => typeById(loadLibrary(), typeIdOf(i.code))?.category !== 'effect' && i.code !== 'EXT-HAZER')
        for (const i of lights) {
            expect(['UP-PL5403', 'UP-COB200']).toContain(i.code)
            expect(i.ordered).toBeLessThanOrEqual(i.stock)
        }
    })
    it('puts the press PARs on the backdrop line\'s clamp points, so the looks reach them (RIG_BUILD §19.4)', () => {
        expect(rigs.minimal.groups.find((g) => g.id === 'par-press-cut').x_m.every((x) => Math.abs(x * 2 - Math.round(x * 2)) < 1e-9)).toBe(true)
        // and lights the press in at least two cues
        const lit = Object.entries(rigs.minimal.looks).filter(([, l]) => (l.levels?.['par-press-cut'] ?? 1) > 0).map(([k]) => k)
        expect(lit.length).toBeGreaterThanOrEqual(2)
    })
})
