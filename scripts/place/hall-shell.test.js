// hall_shell.py (2026-10-20): the hall record's dims.shell (walls and roof) is the model's own envelope, and every lamp we
// know of hangs inside it. Two guards: (1) --check rebuilds the shell with hall.py build() and fails when the record's
// shell or geometry no longer matches the code (a building edited without its shell); (2) no lamp of the owner's final
// hall reference (10-17) or of the v2.8 rig stands outside the inner faces (a lamp behind a wall would light nothing,
// and a first-surface cast from it would start outside the room). Skipped when python3/numpy is missing.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const hasPython = spawnSync('python3', ['-c', 'import numpy'], { encoding: 'utf8' }).status === 0
const rigs = name => path.join(here, 'rigs', name)
const HALLS = ['moxir-hall-2026-10-11-v11-show-park-far41.hall.json', 'moxir-hall-2026-10-12-v13-skin.hall.json']
const read = name => JSON.parse(fs.readFileSync(rigs(name), 'utf8'))

function innerBox(shell) {
    const at = (pred) => shell.filter(pred).map(s => s.plane.at_m)
    const n = (s, i, v) => s.plane.inner_normal[i] === v
    return {
        west: Math.max(...at(s => s.surface.startsWith('long wall') && n(s, 0, 1))),
        east: Math.min(...at(s => s.surface.startsWith('long wall') && n(s, 0, -1))),
        far: Math.max(...at(s => s.surface.startsWith('end wall') && n(s, 2, 1))),
        entry: Math.min(...at(s => s.surface.startsWith('end wall') && n(s, 2, -1))),
        deck: Math.min(...at(s => s.surface.startsWith('deck'))),
    }
}

describe.skipIf(!hasPython)('hall_shell.py', () => {
    for (const hall of HALLS) {
        it(`${hall}: dims.shell is the model's envelope (hall.py build(), --check)`, () => {
            const r = spawnSync('python3', ['-I', path.join(here, 'hall_shell.py'), '--hall', rigs(hall), '--check'],
                { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } })
            expect(r.stderr).toBe('')
            expect(r.status).toBe(0)
            const shell = read(hall).dims.shell
            expect(shell.length).toBeGreaterThan(0)
            expect(shell.every(s => s.validated === false && s.source.commit && s.date && s.method)).toBe(true)
        }, 120000)
    }

    const box = innerBox(read(HALLS[0]).dims.shell)
    const inside = ([x, y, z]) => x > box.west && x < box.east && z > box.far && z < box.entry && y >= 0 && y < box.deck

    it('every lamp of the final hall reference (10-17) is inside the shell (walls, end walls, under the deck)', () => {
        expect(box).toEqual({ west: -36.4, east: 60.4, far: -53.8, entry: 53.8, deck: 13.35 })   // hall.py v11 numbers
        const lamps = read('moxir-hall-reference-2026-10-17.json').lamps
        expect(lamps.length).toBeGreaterThan(70)
        expect(lamps.filter(l => !inside(l.position)).map(l => l.id)).toEqual([])
    })

    it('every laser source the margin check casts from (v2.8 rig) is inside the shell', () => {
        const lasers = read('moxir-v2-8-matrix-2026-10-13.json').fixtures.filter(f => f.laser && f.status === 'used')
        expect(lasers.length).toBe(8)
        expect(lasers.filter(f => !inside(f.p)).map(f => f.id)).toEqual([])
        // Found 2026-10-20, not tested away: the same 10-13 design rig draws 10 floor PARs (rig-par-planes-*) at x -38.2
        // and z 55.8, outside the walls; the 10-17 reference above has none outside (docs/ai/sessions/feat-hall-shell-2026-10-20.md).
    })
})
