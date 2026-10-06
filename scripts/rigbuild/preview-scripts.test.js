// @vitest-environment node
//
// The preview pack / install / rollback scripts under stubs: no real di, no real sensors, no real build.
// Review B6 (2026-09-30): rollback order with data, a half-made backup must not block the re-run,
// and the thermal guard must refuse to run blind.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { REPO_ROOT } from '../place/common.mjs'

const INSTALL = path.join(REPO_ROOT, 'scripts/rigbuild/preview-install.sh')
const PACK = path.join(REPO_ROOT, 'scripts/rigbuild/pack-preview.sh')

const stub = (dir, name, body) => {
    fs.writeFileSync(path.join(dir, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 })
}

const sandbox = ({ diFails = false, sensors = 'Package id 0:  +50.0°C  (high = +100.0°C)' } = {}) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'di-preview-'))
    const bin = path.join(home, 'bin')
    fs.mkdirSync(bin)
    fs.mkdirSync(path.join(home, '.di/data/lighting'), { recursive: true })
    fs.mkdirSync(path.join(home, '.di/data/spaces/moxir'), { recursive: true })
    fs.mkdirSync(path.join(home, '.di/versions'))
    fs.writeFileSync(path.join(home, '.di/di.env'), 'PORT=1\n')
    fs.writeFileSync(path.join(home, '.di/state.json'), '{}')
    fs.writeFileSync(path.join(home, '.di/data/di.db'), 'db')
    const log = path.join(home, 'calls.log')
    stub(bin, 'di', `echo "di $*" >> "${log}"\n[ "$1" = save ] && echo x > moxir.diiii\n${diFails ? '[ "$1" = update ] && exit 1' : ''}\nexit 0`)
    stub(bin, 'sqlite3', `echo "sqlite3" >> "${log}"; f=\${2#.backup \\'}; f=\${f%\\'}; echo copy > "$f"`)
    stub(bin, 'sensors', `echo "${sensors}"`)
    const root = path.join(home, 'backups')
    fs.mkdirSync(path.join(root, 'step-12/installed'), { recursive: true })
    fs.writeFileSync(path.join(root, 'step-12/installed/di-runtime-0.0.0-prev.tar.gz'), 'prev')
    const art = path.join(home, 'di-runtime-0.0.0-new.tar.gz')
    fs.writeFileSync(art, 'new')
    const env = { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}` }
    return { home, root, art, env, log, calls: () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : []) }
}
const install = (sb, extra = []) => spawnSync('sh', [INSTALL, '--step', '13', '--version', '0.0.0-new', '--prev', '0.0.0-prev', '--artifact', sb.art, '--root', sb.root, ...extra], { env: sb.env, encoding: 'utf8' })

describe('preview-install.sh and its rollback', () => {
    it('installs, then the rollback with data runs down → update → up, never update before down (B6-1)', () => {
        const sb = sandbox()
        const r = install(sb)
        expect(r.status, r.stderr).toBe(0)
        expect(fs.existsSync(path.join(sb.root, 'step-13/rollback.sh'))).toBe(true)
        expect(fs.existsSync(path.join(sb.root, 'step-13.partial'))).toBe(false)
        fs.writeFileSync(sb.log, '')
        const rb = spawnSync('sh', [path.join(sb.root, 'step-13/rollback.sh'), '--with-data'], { env: sb.env, encoding: 'utf8' })
        expect(rb.status, rb.stderr).toBe(0)
        const order = sb.calls().map((c) => c.split(' ')[1])
        expect(order).toEqual(['down', 'update', 'up'])
    })
    it('a rollback whose di update fails says di.env is already restored and exits 1 (B6-5)', () => {
        const sb = sandbox()
        expect(install(sb).status).toBe(0)
        const failing = sandbox({ diFails: true })
        const rb = spawnSync('sh', [path.join(sb.root, 'step-13/rollback.sh')], { env: { ...sb.env, PATH: `${path.join(failing.home, 'bin')}:${process.env.PATH}` }, encoding: 'utf8' })
        expect(rb.status).toBe(1)
        expect(rb.stderr).toMatch(/di\.env is already restored/)
    })
    it('a failure half-way leaves no step directory that blocks the re-run (B6-5)', () => {
        const sb = sandbox()
        const broken = path.join(sb.home, 'bin2')
        fs.mkdirSync(broken)
        stub(broken, 'di', 'exit 0') // `di save` writes no moxir.diiii → the install refuses after the backup started
        const r1 = spawnSync('sh', [INSTALL, '--step', '13', '--version', '0.0.0-new', '--prev', '0.0.0-prev', '--artifact', sb.art, '--root', sb.root], { env: { ...sb.env, PATH: `${broken}:${sb.env.PATH}` }, encoding: 'utf8' })
        expect(r1.status).not.toBe(0)
        expect(fs.existsSync(path.join(sb.root, 'step-13'))).toBe(false)
        fs.rmSync(path.join(sb.root, 'step-13.partial'), { recursive: true })
        expect(install(sb).status).toBe(0)
    })
})

describe('pack-preview.sh refuses to run blind (B6-3)', () => {
    it('refuses a non-integer --pause-at', () => {
        const sb = sandbox()
        const r = spawnSync('sh', [PACK, '0.0.0-new', '--pause-at', '95C'], { env: sb.env, encoding: 'utf8' })
        expect(r.status).toBe(2)
        expect(r.stderr).toMatch(/whole numbers/)
    })
    it('refuses when sensors shows no CPU package temperature, before any build starts', () => {
        const sb = sandbox({ sensors: 'nothing useful' })
        const r = spawnSync('sh', [PACK, '0.0.0-new'], { env: sb.env, encoding: 'utf8' })
        expect(r.status).toBe(1)
        expect(r.stderr).toMatch(/no CPU package temperature/)
    })
})
