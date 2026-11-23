// plot_grid_measure.py (2026-11-19): measures a rectangle on a light plot against the plot's own grid.
// The test MAKES its drawing (Pillow, in a temp folder, removed afterwards): a white page, a light-grey grid of
// 100 px, a black rectangle 4 squares wide and 2.5 high with its left and right edges on grid lines, a second
// one of 3 x 2 squares, and a magenta bar 3 squares long; the same page once more with a see-through background.
// Skipped when python3 with numpy and Pillow is missing; the PDF case is skipped when pdftoppm (poppler) is missing.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const tool = path.join(here, 'plot_grid_measure.py')
const hasPython = spawnSync('python3', ['-I', '-c', 'import numpy, PIL'], { encoding: 'utf8' }).status === 0
const hasPdftoppm = spawnSync('pdftoppm', ['-v'], { encoding: 'utf8' }).error === undefined
const env = { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }

const MAKE = `
import sys
from PIL import Image, ImageDraw
out_png, out_pdf = sys.argv[1], sys.argv[2]
im = Image.new('RGB', (1000, 800), (255, 255, 255))
d = ImageDraw.Draw(im)
for x in range(50, 1000, 100):
    if x == 850:
        continue  # one missing line: the pitch is the MEDIAN gap, not the largest
    d.line([(x, 0), (x, 799)], fill=(230, 230, 230))
for y in range(50, 800, 100):
    d.line([(0, y), (999, y)], fill=(230, 230, 230))
d.rectangle([149, 149, 551, 151], fill=(0, 0, 0))
d.rectangle([149, 399, 551, 401], fill=(0, 0, 0))
d.rectangle([149, 149, 151, 401], fill=(0, 0, 0))
d.rectangle([549, 149, 551, 401], fill=(0, 0, 0))
d.rectangle([100, 600, 399, 605], fill=(255, 0, 255))
for r in ([649, 449, 951, 451], [649, 649, 951, 651], [649, 449, 651, 651], [949, 449, 951, 651]):
    d.rectangle(r, fill=(0, 0, 0))
im.save(out_png)
clear = im.convert('RGBA')
clear.putdata([(0, 0, 0, 0) if p[:3] == (255, 255, 255) else p for p in clear.getdata()])
clear.save(out_png.replace('.png', '-alpha.png'))
im.convert('P', palette=Image.ADAPTIVE, colors=8).save(out_pdf, resolution=100)
`

const NEAR = '150,150,550,400'
let dir, png, pdf

function run(args) {
    return spawnSync('python3', ['-I', tool, ...args], { encoding: 'utf8', env })
}

describe.skipIf(!hasPython)('plot_grid_measure.py', () => {
    beforeAll(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plot-grid-'))
        png = path.join(dir, 'plan.png')
        pdf = path.join(dir, 'plan.pdf')
        const made = spawnSync('python3', ['-I', '-c', MAKE, png, pdf], { encoding: 'utf8', env })
        if (made.status !== 0) throw new Error(made.stderr)
    })
    afterAll(() => {
        if (dir) fs.rmSync(dir, { recursive: true, force: true })
    })

    it('reads the pitch and the outline in squares, and the LED wall in whole cabinets (text)', () => {
        const r = run([png, '--near', NEAR, '--cabinet-m', '0.5', '--cabinet-px', '128'])
        expect(r.status).toBe(0)
        const grid = r.stdout.match(/^grid: (\d+) vertical \+ (\d+) horizontal lines, pitch ([\d.]+) x ([\d.]+) px$/m)
        expect(grid).not.toBeNull()
        expect(Math.abs(Number(grid[3]) - 100)).toBeLessThanOrEqual(0.5)
        expect(Math.abs(Number(grid[4]) - 100)).toBeLessThanOrEqual(0.5)
        const out = r.stdout.match(/^outline: .* = ([\d.]+) x ([\d.]+) grid squares = ([\d.]+) x ([\d.]+) m$/m)
        expect(out).not.toBeNull()
        expect(Math.abs(Number(out[1]) - 4)).toBeLessThanOrEqual(0.02)
        expect(Math.abs(Number(out[2]) - 2.5)).toBeLessThanOrEqual(0.02)
        expect(r.stdout).toMatch(/^edges on grid lines: left [\d.]+ px off, right [\d.]+ px off/m)
        expect(r.stdout).toMatch(/^LED: .* -> 8 x 5 = 40 cabinets = 1024 x 640 px, 4\.0 x 2\.5 m, 16:10$/m)
        expect(r.stdout.trim().split('\n').pop()).toBe('scale: one grid square = 1 m (given, not measured)')
    })

    it('--json carries the same numbers', () => {
        const r = run([png, '--near', NEAR, '--cabinet-m', '0.5', '--cabinet-px', '128', '--json'])
        expect(r.status).toBe(0)
        const j = JSON.parse(r.stdout)
        expect(Math.abs(j.grid.pitch_px[0] - 100)).toBeLessThanOrEqual(0.5)
        expect(j.grid.metres_per_square).toBe(1)
        expect(Math.abs(j.outline.squares[0] - 4)).toBeLessThanOrEqual(0.02)
        expect(Math.abs(j.outline.squares[1] - 2.5)).toBeLessThanOrEqual(0.02)
        expect(Math.abs(j.outline.metres[0] - 4)).toBeLessThanOrEqual(0.02)
        expect(j.outline.off_grid_px.left).toBeLessThanOrEqual(1)
        expect(j.outline.off_grid_px.right).toBeLessThanOrEqual(1)
        expect(j.led.cabinets).toEqual([8, 5])
        expect(j.led.count).toBe(40)
        expect(j.led.px).toEqual([1024, 640])
        expect(j.picture).toBeNull()
    })

    it('names every cabinet ratio: 16:10 for the first rectangle, 3:2 for the second', () => {
        const second = run([png, '--near', '650,450,950,650', '--cabinet-m', '0.5', '--cabinet-px', '128'])
        expect(second.status).toBe(0)
        expect(second.stdout).toMatch(/^LED: 6\.00 x 4\.00 cabinets -> 6 x 4 = 24 cabinets = 768 x 512 px, 3\.0 x 2\.0 m, 3:2$/m)
        const first = run([png, '--near', NEAR, '--cabinet-m', '0.5', '--cabinet-px', '128'])
        expect(first.stdout).toMatch(/16:10$/m)
    })

    it('LED metres are exact: a wall 1.25 m high is not printed as 1.2 m', () => {
        const r = run([png, '--near', NEAR, '--grid-m', '0.5', '--cabinet-m', '0.25', '--cabinet-px', '128'])
        expect(r.status).toBe(0)
        expect(r.stdout).toMatch(/^LED: .* -> 8 x 5 = 40 cabinets = 1024 x 640 px, 2\.0 x 1\.25 m, 16:10$/m)
    })

    it('a see-through PNG is laid on white and gives the same squares', () => {
        const r = run([path.join(dir, 'plan-alpha.png'), '--near', NEAR, '--json'])
        expect(r.status).toBe(0)
        const j = JSON.parse(r.stdout)
        expect(Math.abs(j.outline.squares[0] - 4)).toBeLessThanOrEqual(0.02)
        expect(Math.abs(j.outline.squares[1] - 2.5)).toBeLessThanOrEqual(0.02)
    })

    it('a --picture name Pillow cannot save, and a cabinet size of zero or less, fail with one line', () => {
        for (const name of ['out', 'out.txt']) {
            const r = run([png, '--near', NEAR, '--picture', path.join(dir, name)])
            expect(r.status).toBe(1)
            expect(r.stderr).toMatch(/^FAIL: .*\.png/)
            expect(r.stderr).not.toContain('Traceback')
        }
        const c = run([png, '--near', NEAR, '--cabinet-m', '0.5', '--cabinet-px', '-5'])
        expect(c.status).toBe(1)
        expect(c.stderr).toMatch(/^FAIL: /)
        expect(c.stdout).toBe('')
        const zero = run([png, '--near', NEAR, '--cabinet-m', '0.5', '--cabinet-px', '0'])
        expect(zero.status).toBe(1)
        expect(zero.stderr).toMatch(/^FAIL: .*must be positive/)
    })

    it('--grid-m 0.5 halves the metres', () => {
        const j = JSON.parse(run([png, '--near', NEAR, '--grid-m', '0.5', '--json']).stdout)
        expect(Math.abs(j.outline.metres[0] - 2)).toBeLessThanOrEqual(0.01)
        expect(Math.abs(j.outline.metres[1] - 1.25)).toBeLessThanOrEqual(0.01)
        expect(j.led).toBeNull()
    })

    it('a magenta cue of 3 squares reads 3.00', () => {
        const r = run([png, '--near', NEAR, '--cue', 'bar=50,590,450,620,magenta', '--json'])
        expect(r.status).toBe(0)
        const c = JSON.parse(r.stdout).cues[0]
        expect(c.name).toBe('bar')
        expect(Math.abs(c.squares[0] - 3)).toBeLessThanOrEqual(0.03)
    })

    it('an empty cue window fails with one line', () => {
        const r = run([png, '--near', NEAR, '--cue', 'none=700,100,900,200,magenta'])
        expect(r.status).toBe(1)
        expect(r.stderr).toMatch(/^FAIL: cue 'none'/)
        expect(r.stderr).not.toContain('Traceback')
    })

    it('a --near 300 px off fails with one FAIL line, no traceback', () => {
        const r = run([png, '--near', '450,450,850,700'])
        expect(r.status).toBe(1)
        expect(r.stderr).toMatch(/^FAIL: .* — /)
        expect(r.stderr).not.toContain('Traceback')
        expect(r.stdout).toBe('')
    })

    it('cabinets that do not come out whole fail', () => {
        const r = run([png, '--near', NEAR, '--cabinet-m', '0.3', '--cabinet-px', '128'])
        expect(r.status).toBe(1)
        expect(r.stderr).toMatch(/^FAIL: .*whole number/)
        expect(r.stderr).not.toContain('Traceback')
    })

    it('a missing file and a bad argument fail with FAIL', () => {
        const a = run([path.join(dir, 'nope.png'), '--near', NEAR])
        expect(a.status).toBe(1)
        expect(a.stderr).toMatch(/^FAIL: /)
        const b = run([png, '--near', '1,2,3'])
        expect(b.status).toBe(1)
        expect(b.stderr).toMatch(/^FAIL: /)
        expect(b.stderr).not.toContain('Traceback')
    })

    it('a size that is not a number (nan, inf) fails with one line, never a nan result', () => {
        const cases = [['--grid-m', 'nan'], ['--grid-m', 'inf'], ['--cabinet-m', 'nan', '--cabinet-px', '128'], ['--tolerance', 'nan']]
        for (const extra of cases) {
            const r = run([png, '--near', NEAR, ...extra])
            expect(r.status).toBe(1)
            expect(r.stderr).toMatch(/^FAIL: argument --[a-z-]+: /)
            expect(r.stderr).not.toContain('Traceback')
            expect(r.stdout).toBe('')
        }
        const far = run([png, '--near', 'inf,1,2,3'])
        expect(far.status).toBe(1)
        expect(far.stderr).toMatch(/^FAIL: argument --near: /)
        expect(far.stderr).not.toContain('Traceback')
    })

    it('--picture writes a PNG of the size the tool promises', () => {
        const out = path.join(dir, 'pic.png')
        const j = JSON.parse(run([png, '--near', NEAR, '--cabinet-m', '0.5', '--cabinet-px', '128', '--picture', out, '--json']).stdout)
        expect(j.picture.path).toBe(out)
        const buf = fs.readFileSync(out)
        expect(buf.subarray(1, 4).toString()).toBe('PNG')
        expect(buf.readUInt32BE(16)).toBe(j.picture.px[0])
        expect(buf.readUInt32BE(20)).toBe(j.picture.px[1])
    })

    it.skipIf(!hasPdftoppm)('a PDF of the same page gives the same squares', () => {
        const j = JSON.parse(run([pdf, '--dpi', '100', '--near', NEAR, '--json']).stdout)
        expect(Math.abs(j.outline.squares[0] - 4)).toBeLessThanOrEqual(0.05)
        expect(Math.abs(j.outline.squares[1] - 2.5)).toBeLessThanOrEqual(0.05)
    })

    // last on purpose: before the guard existed this very run replaced the drawing the other cases read
    it('--picture never overwrites the drawing itself', () => {
        const before = fs.readFileSync(png)
        const r = run([png, '--near', NEAR, '--picture', png])
        expect(r.status).toBe(1)
        expect(r.stderr).toMatch(/^FAIL: .*overwrite/)
        expect(fs.readFileSync(png).equals(before)).toBe(true)
    })
})
