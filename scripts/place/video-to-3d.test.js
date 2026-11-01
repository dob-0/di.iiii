// video-to-3d.sh: syntax, the dry-run plan for every tool, the refusals, and a whole run against a stub Colab.
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SH = path.join(HERE, 'video-to-3d.sh')
const run = (args, env = {}) => spawnSync('bash', [SH, ...args], { encoding: 'utf8', env: { ...process.env, ...env } })

it('bash -n', () => {
    expect(spawnSync('bash', ['-n', SH]).status).toBe(0)
})

for (const tool of ['colmap', 'colmap-global', 'mast3r', 'vggt']) {
    it(`dry-run plan: ${tool}`, () => {
        const r = run(['--dry-run', '--tool', tool, 'a.mp4'])
        expect(r.status, r.stderr).toBe(0)
        expect(r.stdout).toMatch(/PLAN/)
        expect(r.stdout).toMatch(/colab new -s v2d-/)
        expect(r.stdout).toMatch(/colab stop -s v2d-/)
        expect(r.stdout).toMatch(/licence:/)
        expect(r.stdout).not.toMatch(/cinema|moxir|dilijan/i)
    })
}

it('winner refuses while no tool beat the baseline', () => {
    const r = run(['--dry-run', '--tool', 'winner', 'a.mp4'])
    expect(r.status).toBe(3)
    expect(r.stderr).toMatch(/no tool beat the baseline/)
})

it('a real run refuses without --consent', () => {
    const r = run(['--tool', 'colmap', 'a.mp4'])
    expect(r.status).not.toBe(0)
    expect(r.stderr).toMatch(/--consent/)
})

it.skipIf(spawnSync('which', ['ffmpeg']).status !== 0)('whole run on a stub Colab writes report.json and stops the session', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'v2d-'))
    const vid = path.join(d, 'clip.mp4')
    expect(spawnSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=10', vid]).status).toBe(0)
    const log = path.join(d, 'colab.log')
    const stub = path.join(d, 'colab-stub.sh')
    fs.writeFileSync(stub, `#!/usr/bin/env bash
echo "$@" >> ${log}
case "$1" in
  exec) case "$*" in *status.py*) echo "STATE DONE";; esac;;
  download) case "$3" in */sfm_results.json|*sfm_results.json) true;; esac
            f="\${@: -1}"; mkdir -p "$(dirname "$f")"
            case "$f" in *sfm_results.json) echo '{"seq":[[0,5,100],[1,3,50]],"exh":[[0,9,200]]}' > "$f";; *) echo ok > "$f";; esac;;
esac
exit 0
`)
    fs.chmodSync(stub, 0o755)
    const out = path.join(d, 'out')
    const r = run(['--tool', 'colmap', '--consent', 'test clip, nobody in frame', '--out', out, vid], { PLACE_COLAB: stub, V2D_POLL: '0' })
    expect(r.status, r.stderr + r.stdout).toBe(0)
    const rep = JSON.parse(fs.readFileSync(path.join(out, 'report.json'), 'utf8'))
    expect(rep.ok).toBe(true)
    expect(rep.registered).toBe(9)
    expect(rep.models).toBe(3)
    expect(rep.frames).toBe(6)
    expect(rep.camera_path_checked).toBe(false)
    const calls = fs.readFileSync(log, 'utf8')
    expect(calls).toMatch(/^new -s v2d-colmap-/m)
    expect(calls).toMatch(/^stop -s v2d-colmap-/m)
    fs.rmSync(d, { recursive: true, force: true })
})
