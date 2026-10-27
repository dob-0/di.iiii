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
    it('the chart list equals the owner values: measured (N1037) plus the 05:04Z ranges (2026-10-17, recovered 2026-10-21)', () => {
        const span = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
        // measured 74-75, 78-79, 166-167 fall inside the owner's 72-81 and 146-168; 246-253 stands alone
        const want = [...span(72, 81), 88, 89, ...span(146, 168), ...span(246, 253)]
        expect(want).toHaveLength(43)
        expect([...chart.neverUseValues].sort((a, b) => a - b)).toEqual(want)
        expect([...new Set(Object.values(chart.neverUse).flatMap((g) => g.values))].sort((a, b) => a - b)).toEqual(want)
        for (const v of [74, 75, 78, 79, 166, 167, ...span(246, 253)]) expect(chart.neverUseValues).toContain(v)
    })
    it('every 05:04Z entry names its source; 181 is the test pattern; 0-9 is one look', () => {
        for (const k of ['owner-72-81', 'owner-88-89', 'owner-146-168']) {
            expect(chart.neverUse[k].source.when).toBe('2026-10-17 05:04Z')
            expect(chart.neverUse[k].source.recovered).toMatch(/recovered 2026-10-21/)
        }
        expect(chart.testPattern.value).toBe(181)
        expect(chart.neverUseValues).not.toContain(181)
        expect(chart.looks.oneLook).toEqual([0, 9])
    })
    it('the 40 W player refuses the test pattern (181) like the other never-use values', () => {
        const player = path.join(here, '..', 'rigbuild', 'la40-player.mjs')
        const bad = spawnSync(process.execPath, [player, '--graphics', String(chart.testPattern.value)], { encoding: 'utf8' })
        expect(bad.status).not.toBe(0)
        expect(bad.stderr).toMatch(/a forbidden graphic is in the list/)
    })
    it('the 40 W player refuses a graphic from the new list (80) and accepts its defaults', () => {
        const player = path.join(here, '..', 'rigbuild', 'la40-player.mjs')
        const bad = spawnSync(process.execPath, [player, '--graphics', '80'], { encoding: 'utf8' })
        expect(bad.status).not.toBe(0)
        expect(bad.stderr).toMatch(/a forbidden graphic is in the list/)
        const ok = spawnSync(process.execPath, [player], { encoding: 'utf8' }) // no --cues: prints usage, exits 2, touches no desk
        expect(ok.status, ok.stderr).toBe(2)
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
