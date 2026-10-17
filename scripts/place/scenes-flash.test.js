// scenes_flash.cjs (2026-10-17): every scene of a scenes file measured on the desk's own fx.js at its OWN tempo. Holds that a
// sparkle at 33 bpm is over 3 flashes a second (the case a table read by eye let pass), that 20 bpm and a held scene pass, and that
// the committed v6 MOXIR scenes are all within the limit.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const run = (file, ...a) => spawnSync(process.execPath, [path.join(here, 'scenes_flash.cjs'), file, ...a], { encoding: 'utf8' })
const write = (scenes) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-')); const p = path.join(d, 's.json'); fs.writeFileSync(p, JSON.stringify({ scenes })); return p }
const scene = (id, motion) => ({ id, motion })

describe('scenes_flash.cjs', () => {
    it('finds a sparkle at 33 bpm over 3 a second, passes 20 bpm and a held scene', () => {
        const r = run(write([scene('fast', { mode: 'sparkle', bpm: 33, depth: 255, spatial: 'x' }), scene('slow', { mode: 'sparkle', bpm: 20, depth: 255, spatial: 'x' }),
            scene('held', { mode: 'none', bpm: 132 }), scene('none', null)]), '--json')
        const out = JSON.parse(r.stdout)
        expect(r.status).toBe(1)
        expect(out.over).toBe(1)
        const by = Object.fromEntries(out.rows.map((x) => [x.id, x.flashes]))
        expect(by.fast).toBeGreaterThan(3)
        expect(by.slow).toBeLessThanOrEqual(3)
        expect(by.held).toBe(0)
    })
    it('the committed v6 MOXIR scenes are within 3 flashes a second', () => {
        const r = run(path.join(here, 'rigs', 'moxir-scenes-50-v6-2026-10-17.json'))
        expect(r.status).toBe(0)
        expect(r.stdout).toContain('0 over 3 flashes a second')
    })
})
