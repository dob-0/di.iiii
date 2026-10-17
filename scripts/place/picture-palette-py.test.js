// picture_palette.py (2026-10-17, moved from the 10-15 scenes job and made generic): references and renders measured the same way.
// Holds the new "too much white" numbers on a synthetic picture: dark, white glow and coloured glow shares, and the hue of the colour.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const hasPy = spawnSync('python3', ['-c', 'import numpy, PIL'], { encoding: 'utf8' }).status === 0

describe.skipIf(!hasPy)('picture_palette.py', () => {
    it('measures dark, white glow and green glow shares of a picture', () => {
        const d = fs.mkdtempSync(path.join(os.tmpdir(), 'palette-')); const png = path.join(d, 'p.png'); const out = path.join(d, 'o.json')
        // 160 x 100: left half black, a 40 px white band, a 40 px green band
        const mk = spawnSync('python3', ['-c', `from PIL import Image
im = Image.new('RGB', (160, 100), (0, 0, 0))
for x in range(80, 120):
    for y in range(100): im.putpixel((x, y), (255, 255, 255))
for x in range(120, 160):
    for y in range(100): im.putpixel((x, y), (0, 210, 40))
im.save('${png}')`], { encoding: 'utf8' })
        expect(mk.status).toBe(0)
        const r = spawnSync('python3', ['-I', path.join(here, 'picture_palette.py'), out, '--group', 'g', png], { encoding: 'utf8' })
        const j = JSON.parse(fs.readFileSync(out, 'utf8')).g; fs.rmSync(d, { recursive: true, force: true })
        expect(r.status).toBe(0)
        expect(j.dark_pct).toBeCloseTo(50, 0)
        expect(j.white_glow_pct).toBeCloseTo(25, 0)
        expect(j.colour_glow_pct).toBeCloseTo(25, 0)
        expect(j.colour_glow_hue_pct.green).toBeGreaterThan(99)
    })
})
