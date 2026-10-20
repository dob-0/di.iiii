// Laser safety rules live in ONE home each (2026-10-20, owner rule "facts live in ONE file"; ledger N1037):
//   distances  -> scripts/place/laser-distance.mjs   (LASER_MIN_HEIGHT_M 3 m, LASER_HAND_RULE_M = 3 m + hand 2.4 m)
//   40 W DMX never-use values -> scripts/place/fixtures/charts/up-la40wf.json (graphics.neverUseValues, dotValueRanges)
// Everything else READS them. This test fails when a second copy appears in the scripts or when a reader drifts.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LASER_MIN_HEIGHT_M, LASER_HAND_RULE_M } from './laser-distance.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const chart = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/charts/up-la40wf.json'), 'utf8')).graphics
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.name === 'node_modules' || e.name === 'rigs' || e.name === 'fixtures' ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]))
const code = [...walk(here), ...walk(path.join(here, '..', 'rigbuild'))].filter((f) => /\.(py|mjs|js)$/.test(f) && !/\.test\.js$/.test(f) && !f.endsWith('laser-distance.mjs'))
const read = (f) => fs.readFileSync(f, 'utf8')

describe('laser rules: one source', () => {
    it('the hand rule is derived from the 3 m rule', () => {
        expect(LASER_MIN_HEIGHT_M).toBe(3)
        expect(LASER_HAND_RULE_M).toBeCloseTo(5.4, 9)
    })
    it('the chart list equals the owner values of ledger N1037 (74-75, 78-79, 166-167, 246-253)', () => {
        const want = [74, 75, 78, 79, 166, 167, ...Array.from({ length: 8 }, (_, i) => 246 + i)]
        expect([...chart.neverUseValues].sort((a, b) => a - b)).toEqual(want)
        expect(Object.values(chart.neverUse).flatMap((g) => g.values).sort((a, b) => a - b)).toEqual(want)
    })
    it('no script holds its own never-use list or dot ranges', () => {
        const bad = code.filter((f) => /\b74,\s*75,\s*78,\s*79\b|\b246\D{1,4}253\b|\b146\D{1,4}165\b/.test(read(f)))
        expect(bad.map((f) => path.relative(here, f))).toEqual([])
    })
    it('no script types the hand rule 5.4 m as a literal', () => {
        const bad = code.filter((f) => /(HAND_RULE\w*\s*=\s*5\.4|=\s*5\.4,\s*9\.0|hand rule 5\.4 m\)\{)/.test(read(f)))
        expect(bad.map((f) => path.relative(here, f))).toEqual([])
    })
    it('the python reader returns the same numbers as the modules', () => {
        const r = spawnSync('python3', ['-I', '-c', 'import sys,json; sys.path.insert(0,sys.argv[1]); import laser_rules as L; print(json.dumps([L.MIN_HEIGHT_M, L.HAND_RULE_M, L.la40_never_use()]))', here], { encoding: 'utf8' })
        expect(r.status, r.stderr).toBe(0)
        const [min, hand, never] = JSON.parse(r.stdout)
        expect(min).toBe(LASER_MIN_HEIGHT_M)
        expect(hand).toBeCloseTo(LASER_HAND_RULE_M, 9)
        expect(never).toEqual([...chart.neverUseValues].sort((a, b) => a - b))
    })
})
