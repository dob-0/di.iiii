// laser_margin.py (2026-10-13): every laser line of the v2.8 matrix rig cast over the dance zone, lowest height above
// what a person can stand on, against the 3 m audience separation. Two halves: a synthetic room where the answer is known
// by hand (a 2 m box under a 4 m line gives 2 m, and fails), and the committed rig, whose floor-only minimum is re-derived
// here in plain JS from the records so the caster cannot quietly agree with itself.
// Skipped when python3/numpy is missing.
import { describe, it, expect, beforeAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LASER_MIN_HEIGHT_M } from './laser-distance.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const hasPython = spawnSync('python3', ['-c', 'import numpy'], { encoding: 'utf8' }).status === 0
const RIG = path.join(here, 'rigs', 'moxir-v2-8-matrix-2026-10-13.json')
const HALL = path.join(here, 'rigs', 'moxir-hall-2026-10-11-v11-show-park-far41.hall.json')

function run(args) {
    const r = spawnSync('python3', ['-I', path.join(here, 'laser_margin.py'), '--json', ...args],
        { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }, maxBuffer: 64 * 1024 * 1024 })
    if (r.status !== 0) throw new Error(r.stderr)
    return JSON.parse(r.stdout)
}

describe.skipIf(!hasPython)('laser_margin.py', () => {
    it('measures a hand-checked synthetic room: box under the line, a line outside, a hanging strike, the tilt', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'laser-margin-'))
        const hall = { dims: { zones: { dance: { used: { x_m: [0, 10], z_m: [0, 10] } } }, massing: [
            { id: 'plinth', x_m: [4, 6], y_m: [0, 2], z_m: [4, 6] },
            { id: 'lamp', x_m: [-1, 1], y_m: [3.5, 4.5], z_m: [20, 21] },
        ] } }
        const beam = (id, to, extra = {}) => ({ id, to, off: false, ...extra })
        const rig = {
            fixtures: [
                { id: 'a', type: 't', status: 'used', p: [5, 4, -10], laser: { beams: [beam('over-plinth', [5, 4, 30])] } },
                { id: 'b', type: 't', status: 'used', p: [-5, 6, -10], laser: { beams: [beam('outside', [-5, 6, 30])] } },
                { id: 'c', type: 't', status: 'used', p: [0, 4, -10], laser: { beams: [beam('through-lamp', [0, 4, 30])] } },
                { id: 'd', type: 't', status: 'used', p: [2, 5, -10], laser: { beams: [beam('tilted', [2, 5, 30])] } },
                { id: 'e', type: 't', status: 'used', p: [2, 5, -10], laser: { beams: [beam('dark', [2, 1, 30], { off: true })] } },
            ],
            solids: [],
            lasers: { tubes: [{ beam: 'tilted', half_fan_deg: 2.0 }] },
        }
        fs.writeFileSync(path.join(dir, 'rig.json'), JSON.stringify(rig))
        fs.writeFileSync(path.join(dir, 'hall.json'), JSON.stringify(hall))
        const R = run(['--rig', path.join(dir, 'rig.json'), '--hall', path.join(dir, 'hall.json')])
        const by = Object.fromEntries(R.lines.map(l => [l.line, l]))
        expect(Object.keys(by).sort()).toEqual(['outside', 'over-plinth', 'through-lamp', 'tilted'])   // 'dark' is off
        expect(by['over-plinth'].lowest_m).toBeCloseTo(2.0, 6)
        expect(by['over-plinth'].over).toBe('plinth')
        expect(by['over-plinth'].pass_3m).toBe(false)
        expect(by['over-plinth'].analytic_floor_only_m).toBeCloseTo(4.0, 6)
        expect(by.outside.crosses_zone).toBe(false)
        expect(by['through-lamp'].hanging_strike.solid).toBe('lamp')
        expect(by['through-lamp'].lowest_m).toBeCloseTo(4.0, 6)
        // tilted 2 deg down about (2,5,-10): the lowest point is the far zone edge z = 10, 20 m out in plan
        const drop = 20 * Math.tan(2 * Math.PI / 180)
        expect(by.tilted.lowest_m).toBeCloseTo(5.0, 6)
        expect(by.tilted.lowest_tilted_m).toBeCloseTo(5.0 - drop, 2)
        expect(R.summary.worst.line).toBe('over-plinth')
        fs.rmSync(dir, { recursive: true, force: true })
    }, 60000)

    describe('must-fail and boundary cases (show safety: conservative)', () => {
        const zone = { x_m: [0, 10], z_m: [0, 10] }
        const room = (fixtures, dims = {}) => {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'laser-margin-'))
            fs.writeFileSync(path.join(dir, 'rig.json'), JSON.stringify({ fixtures, solids: [], lasers: { tubes: [] } }))
            fs.writeFileSync(path.join(dir, 'hall.json'), JSON.stringify({ dims: { zones: { dance: { used: zone } }, massing: [], ...dims } }))
            const R = run(['--rig', path.join(dir, 'rig.json'), '--hall', path.join(dir, 'hall.json')])
            fs.rmSync(dir, { recursive: true, force: true })
            return Object.fromEntries(R.lines.map(l => [l.line, l]))
        }
        const fx = (id, p, to) => ({ id: 'f' + id, type: 't', status: 'used', p, laser: { beams: [{ id, to, off: false }] } })

        it('a beam dipping into the zone fails: 3 m at the source falling to 2 m at the zone edge', () => {
            const by = room([fx('dip', [5, 4, -10], [5, 0, 10])])
            expect(by.dip.pass_3m).toBe(false)
            expect(by.dip.lowest_m).toBeLessThan(3)
        })

        it('a margin exactly at the limit passes, and 1 mm under fails', () => {
            const by = room([fx('at', [5, LASER_MIN_HEIGHT_M, -10], [5, LASER_MIN_HEIGHT_M, 30]),
                             fx('under', [5, LASER_MIN_HEIGHT_M - 0.001, -10], [5, LASER_MIN_HEIGHT_M - 0.001, 30])])
            expect(by.at.lowest_m).toBeCloseTo(LASER_MIN_HEIGHT_M, 9)
            expect(by.at.margin_m).toBeCloseTo(0, 9)
            expect(by.at.pass_3m).toBe(true)
            expect(by.under.pass_3m).toBe(false)
        })

        it('a beam stops at the first surface: a wall slab before the zone means the zone is not reached', () => {
            const f = [fx('walled', [5, 2, -10], [5, 2, 30])]   // 2 m up: would FAIL over the zone if it got there
            const open = room(f)
            expect(open.walled.crosses_zone).toBe(true)
            expect(open.walled.pass_3m).toBe(false)
            const wall = { id: 'wall', x_m: [-50, 50], y_m: [0, 12], z_m: [-5, -4] }
            const closed = room(f, { shell: [wall] })
            expect(closed.walled.crosses_zone).toBe(false)
        })

        it('a beam into the ceiling or the floor does not count past it', () => {
            const roof = { id: 'roof', x_m: [-50, 50], y_m: [8, 9], z_m: [-50, 50] }
            const by = room([fx('up', [5, 4, -10], [5, 40, 30])], { shell: [roof] })   // rises into the roof before the zone
            expect(by.up.crosses_zone).toBe(false)
            const fl = room([fx('down', [5, 5, -10], [5, -20, 30])])   // dives into the floor: stops at y 0, so the zone stretch is short or gone
            expect(fl.down.crosses_zone === false || fl.down.pass_3m === false).toBe(true)
        })
    })

    describe('the v2.8 matrix rig over the dance zone', () => {
        let R
        beforeAll(() => { R = run(['--rig', RIG, '--hall', HALL]) }, 120000)

        it('casts all 38 lines (36 comb + the two UP-LA40WF), all over the zone, all >= 3 m even tilted by the half-fan', () => {
            expect(R.summary.lines).toBe(38)
            expect(R.summary.crossing_zone).toBe(38)
            expect(R.summary.pass_3m).toBe(38)
            expect(R.separation_m).toBe(LASER_MIN_HEIGHT_M)   // one source: dev's laser-distance.mjs
            expect(R.validated).toBe(false)
            expect(R.shell_modelled).toBe(false)
            expect(R.summary.worst.lowest_m).toBeGreaterThanOrEqual(8)
            expect(R.summary.worst_tilted.lowest_tilted_m).toBeGreaterThanOrEqual(7)
            expect(R.summary.hanging_strikes).toEqual([])
        })

        it('agrees with a plain-JS floor-only minimum from the records, less at most the barrier (1.1 m)', () => {
            const rig = JSON.parse(fs.readFileSync(RIG, 'utf8'))
            const zone = JSON.parse(fs.readFileSync(HALL, 'utf8')).dims.zones.dance.used
            const by = Object.fromEntries(R.lines.map(l => [l.line, l]))
            let n = 0
            for (const f of rig.fixtures) {
                if (!f.laser || f.status !== 'used') continue
                for (const b of f.laser.beams) {
                    if (b.off) continue
                    const a = f.p, e = b.to
                    let t0 = 0, t1 = 1
                    for (const [k, [lo, hi]] of [[0, zone.x_m], [2, zone.z_m]]) {
                        const d = e[k] - a[k]
                        const ta = (lo - a[k]) / d, tb = (hi - a[k]) / d
                        t0 = Math.max(t0, Math.min(ta, tb)); t1 = Math.min(t1, Math.max(ta, tb))
                    }
                    const yMin = Math.min(a[1] + t0 * (e[1] - a[1]), a[1] + t1 * (e[1] - a[1]))
                    const got = by[b.id]
                    expect(got.analytic_floor_only_m, b.id).toBeCloseTo(yMin, 2)
                    expect(got.lowest_m, b.id).toBeLessThanOrEqual(yMin + 1e-6)
                    expect(got.lowest_m, b.id).toBeGreaterThanOrEqual(yMin - 1.1 - 0.06)
                    n++
                }
            }
            expect(n).toBe(38)
        })
    })
})
