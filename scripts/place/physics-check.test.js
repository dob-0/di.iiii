// physics_check.py (2026-10-20): every surface a beam is tested against comes from the hall record's dims.shell (one source with
// the model the room draws), never from planes copied by hand; a hall without a shell is refused. The cases live in
// physics_check_test.py (a fixture room with a deck, a lantern opening and a lantern roof; the real hall record; the owner's final
// hall reference 10-17 drawn to its first surfaces = 0 leaks); this runs them in the node suite and checks the CLI refusal.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const hasPython = spawnSync('python3', ['--version'], { encoding: 'utf8' }).status === 0

describe.skipIf(!hasPython)('physics_check.py reads dims.shell', () => {
    it('python cases pass (fixture slabs, opening, refusals, real hall, reference rig)', () => {
        const r = spawnSync('python3', ['-I', '-m', 'unittest', 'discover', '-s', here, '-p', 'physics_check_test.py'], { encoding: 'utf8', cwd: path.join(here, '..', '..') })
        expect(r.stderr).toMatch(/Ran \d+ tests?/)
        expect(r.stderr).toMatch(/\nOK\s*$/)
        expect(Number(/Ran (\d+) tests?/.exec(r.stderr)[1])).toBeGreaterThan(0)
    })

    it('the CLI refuses a hall record without dims.shell (exit 2, says what to run) before it reads any project', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'physics-check-'))
        try {
            const hall = path.join(dir, 'hall.json')
            fs.writeFileSync(hall, JSON.stringify({ dims: { truss_top_h_m: 13.3, ridge_h_m: 16.5, lantern_w_m: 12 } }))
            const r = spawnSync('python3', ['-I', path.join(here, 'physics_check.py'), '--api', 'http://127.0.0.1:1', '--project', 'x', '--hall', hall], { encoding: 'utf8' })
            expect(r.status).toBe(2)
            expect(r.stderr).toMatch(/no dims\.shell/)
            expect(r.stderr).toMatch(/hall_shell\.py/)
        } finally { fs.rmSync(dir, { recursive: true, force: true }) }
    })
})
