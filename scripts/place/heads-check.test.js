// heads_check.mjs (2026-10-17, physics first): a head move is measured by the room's own arithmetic (headMotion.js). Holds that a
// pan-only move turns a beam that points straight up by 0 degrees (the MOXIR v6 finding: 24 "moving" scenes turned nothing) while a
// nod turns it by its tilt, and that the exit code says so.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const beam = (id, x) => ({ id, type: 'spotLight', name: id, components: { transform: { position: [x, 0.7, 0], rotation: [3.1416, 0, 0], scale: [1, 1, 1] },
    light: { color: '#ffffff', intensity: 1, angle: 0.02 }, fixture: { type: 'up-b380f', mode: '16ch' } } })
const heads = (pattern) => ({ pattern, period_s: 8, pan_deg: 40, tilt_deg: 20, spatial: 'all', kinds: ['up-b380f'] })
const doc = { document: { entities: [beam('b1', -2), beam('b2', 2)], components: { rigLooks: { looks: [{ id: 'sweep', parts: {}, heads: heads('sweep') }, { id: 'nod', parts: {}, heads: heads('nod') }] } } } }

describe('heads_check.mjs', () => {
    it('a pan-only sweep turns an upright beam by 0 degrees; a nod turns it by its tilt', () => {
        const d = fs.mkdtempSync(path.join(os.tmpdir(), 'heads-')); const f = path.join(d, 'doc.json'); fs.writeFileSync(f, JSON.stringify(doc))
        const r = spawnSync(process.execPath, [path.join(here, 'heads_check.mjs'), f, '--json'], { encoding: 'utf8' })
        fs.rmSync(d, { recursive: true, force: true })
        expect(r.status).toBe(1)
        const out = JSON.parse(r.stdout)
        const by = Object.fromEntries(out.rows.map((x) => [x.id, x]))
        expect(out.still).toBe(1)
        expect(by.sweep.median).toBeLessThan(1)
        expect(by.nod.median).toBeGreaterThan(15)
        expect(by.nod.units).toBe(2)
    })
})
