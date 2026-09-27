// @vitest-environment node
//
// Regression guard: the two restore scripts refused every real-size backup on GNU/Linux
// (found 2026-09-26). Their archive check was `tar tzf … | grep -qx …` under `set -o pipefail`.
// grep -q exits at the first match, and the snapshot is the FIRST member, so tar dies of SIGPIPE
// writing the rest of the listing and the pipeline returns 141: "no .backup-snapshot.db", on an
// archive that has one. Prod's 2026-09-24 archive (1,436 members, a 106,678-byte listing) failed
// 3 of 3 on aylmo; on macOS it passed, which is why nobody saw it.
//
// A tiny archive hides it. Measured on aylmo (GNU tar 1.35, GNU grep 3.12), 300 runs each: a
// 453-byte listing failed 0 times, 4 KB once, 17 KB 298 times, 33 KB and up every time. So the
// fixture here lists ~250 KB, more than two 64 KiB pipe buffers: grep can have read at most the
// first two when it quits, and tar still has listing left to write. The first test proves that
// on every Linux run, so the fixture cannot quietly shrink below what catches the bug.
//
// The scripts are run as a person runs them (bash, real tar/gzip/awk/sqlite3), never imported.
// vps-restore.sh is stopped at its "Type 'restore'" prompt, with a PATH that holds no real docker.

import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const RESTORE_DATA = path.join(ROOT_DIR, 'scripts', 'standby', 'restore-data.sh')
const VPS_RESTORE = path.join(ROOT_DIR, 'deploy', 'vps-restore.sh')
const MEMBERS = 3000          // ~84 bytes of listing each: ~250 KB, see the header
const TABLE_ROWS = 3

const which = (name) => {
    const r = spawnSync('bash', ['-c', 'command -v "$1"', '_', name], { encoding: 'utf8' })
    return r.status === 0 ? r.stdout.trim() : ''
}
const BASH = which('bash')
const SQLITE3 = which('sqlite3')
const GNU_GREP = /GNU grep/.test(spawnSync('grep', ['--version'], { encoding: 'utf8' }).stdout || '')
// restore-data.sh checks the database with the sqlite3 CLI. CI must have it (GitHub's Ubuntu
// image does), so it runs there; a machine without the CLI skips the full restores by name.
const CAN_RESTORE = Boolean(SQLITE3 || process.env.CI)
const itIf = (condition) => (condition ? it : it.skip)
// The scripts see this machine's tools, never a caller's exported shell functions.
const ENV = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('BASH_FUNC_')))

const tempDirs = []
const mkTemp = (prefix) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
    tempDirs.push(dir)
    return dir
}
afterEach(() => {
    for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

const tar = (args, cwd) => {
    const r = spawnSync('tar', args, { cwd, encoding: 'utf8', env: { ...ENV, COPYFILE_DISABLE: '1' } })
    if (r.status !== 0) throw new Error(`tar ${args.join(' ')} failed: ${r.stderr}`)
    return r.stdout
}

// An archive in vps-backup.sh's format: .backup-snapshot.db first (a real SQLite file), then
// uploads/ spaces/ snapshots/. `layout: 'dot'` is the `tar -C dir .` spelling (./-prefixed).
const makeArchive = ({ snapshot = true, layout = 'bare' } = {}) => {
    const dir = mkTemp('restore-fixture-')
    const stage = path.join(dir, 'stage')
    const data = path.join(dir, 'data')
    for (const d of [stage, path.join(data, 'uploads'), path.join(data, 'spaces'), path.join(data, 'snapshots')]) {
        fs.mkdirSync(d, { recursive: true })
    }
    if (snapshot) {
        const { DatabaseSync } = require('node:sqlite')
        const db = new DatabaseSync(path.join(stage, '.backup-snapshot.db'))
        db.exec('CREATE TABLE projects (id TEXT PRIMARY KEY)')
        for (let i = 0; i < TABLE_ROWS; i++) db.prepare('INSERT INTO projects (id) VALUES (?)').run(`p${i}`)
        db.close()
    }
    const pad = '0'.repeat(60)
    for (let i = 0; i < MEMBERS; i++) {
        fs.writeFileSync(path.join(data, 'uploads', `asset-${String(i).padStart(4, '0')}-${pad}.bin`), '')
    }
    fs.writeFileSync(path.join(data, 'spaces', 'main.json'), '{}')
    fs.writeFileSync(path.join(data, 'snapshots', 'keep.txt'), 'x')

    const archive = path.join(dir, 'dii-backup-2026-01-01_0000.tar.gz')
    if (layout === 'dot') {
        if (snapshot) fs.renameSync(path.join(stage, '.backup-snapshot.db'), path.join(data, '.backup-snapshot.db'))
        tar(['czf', archive, '-C', data, '.'])
    } else {
        tar(['czf', archive, ...(snapshot ? ['-C', stage, '.backup-snapshot.db'] : []), '-C', data, 'uploads', 'spaces', 'snapshots'])
    }
    return { archive, dir }
}

// A PATH holding only the named tools, found where this machine keeps them. Leaving one out is
// how a test says "this box has no shasum" or "there is no docker here".
const shimPath = (tools, extra = {}) => {
    const bin = mkTemp('restore-bin-')
    for (const tool of tools) {
        const real = which(tool)
        if (real) fs.symlinkSync(real, path.join(bin, tool))
    }
    for (const [name, body] of Object.entries(extra)) {
        fs.writeFileSync(path.join(bin, name), `#!${BASH}\n${body}\n`, { mode: 0o755 })
    }
    return bin
}
const RESTORE_TOOLS = ['tar', 'gzip', 'awk', 'cut', 'date', 'dirname', 'basename', 'mkdir', 'mv', 'rm', 'sqlite3', 'lsof']

const run = (script, args, { PATH = ENV.PATH, input = '' } = {}) => {
    const r = spawnSync(BASH, [script, ...args], { encoding: 'utf8', input, env: { ...ENV, PATH, LC_ALL: 'C' } })
    return { status: r.status, signal: r.signal, out: r.stdout, err: r.stderr }
}

describe.skipIf(process.platform === 'win32')('restore scripts read the whole archive listing', () => {
    it.runIf(process.platform === 'linux' && GNU_GREP)('the fixture is big enough that the old `grep -q` check fails (GNU/Linux)', () => {
        const { archive } = makeArchive()
        expect(tar(['tzf', archive]).length).toBeGreaterThan(2 * 65536)
        const old = spawnSync(BASH, ['-c',
            'set -o pipefail; tar tzf "$1" | grep -qx \'\\(\\./\\)\\?\\.backup-snapshot\\.db\'', '_', archive], { env: ENV })
        expect(old.status).toBe(141)
    })

    itIf(CAN_RESTORE)('restore-data.sh restores a real-size archive whose snapshot is the first member', () => {
        const { archive, dir } = makeArchive()
        expect(tar(['tzf', archive]).split('\n')[0]).toBe('.backup-snapshot.db')
        const root = path.join(dir, 'restored', 'data')

        const r = run(RESTORE_DATA, [archive, root])

        expect(r.err).toBe('')
        expect(r.status).toBe(0)
        expect(r.out).toContain('archive verified')
        expect(r.out).toContain('integrity_check ok')
        expect(r.out).toMatch(new RegExp(`projects\\s+${TABLE_ROWS}\\b`))
        expect(fs.existsSync(path.join(root, 'di.db'))).toBe(true)
        expect(fs.existsSync(path.join(root, '.backup-snapshot.db'))).toBe(false)
        expect(fs.readdirSync(path.join(root, 'uploads'))).toHaveLength(MEMBERS)
        expect(fs.readFileSync(path.join(root, '.restored-from'), 'utf8').trim()).toBe(path.basename(archive))
    })

    itIf(CAN_RESTORE)('restore-data.sh accepts the ./-prefixed spelling of a `tar -C dir .` archive', () => {
        const { archive, dir } = makeArchive({ layout: 'dot' })
        expect(tar(['tzf', archive])).toContain('./.backup-snapshot.db\n')

        const r = run(RESTORE_DATA, [archive, path.join(dir, 'restored')])

        expect(r.status).toBe(0)
        expect(r.out).toContain('archive verified')
    })

    it('restore-data.sh refuses an archive with no snapshot and makes no data root', () => {
        const { archive, dir } = makeArchive({ snapshot: false })
        const root = path.join(dir, 'restored')

        const r = run(RESTORE_DATA, [archive, root])

        expect(r.status).toBe(1)
        expect(r.err).toContain('no .backup-snapshot.db in')
        expect(r.out).not.toContain('archive verified')
        expect(fs.existsSync(root)).toBe(false)
    })

    describe('the sha256 step', () => {
        const sha = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex')

        itIf(CAN_RESTORE)('uses sha256sum when there is no shasum', () => {
            const { archive, dir } = makeArchive()
            const PATH = shimPath([...RESTORE_TOOLS, 'sha256sum'])
            expect(fs.existsSync(path.join(PATH, 'shasum'))).toBe(false)

            const good = run(RESTORE_DATA, [archive, path.join(dir, 'good'), sha(archive)], { PATH })
            expect(good.err).toBe('')
            expect(good.status).toBe(0)
            expect(good.out).toContain('sha256 matches')

            const bad = run(RESTORE_DATA, [archive, path.join(dir, 'bad'), '0'.repeat(64)], { PATH })
            expect(bad.status).toBe(1)
            expect(bad.err).toContain(`sha256 ${sha(archive)} != expected ${'0'.repeat(64)}`)
            expect(fs.existsSync(path.join(dir, 'bad'))).toBe(false)
        })

        itIf(CAN_RESTORE && Boolean(which('shasum')))('uses shasum when there is no sha256sum', () => {
            const { archive, dir } = makeArchive()
            const PATH = shimPath([...RESTORE_TOOLS, 'shasum', 'perl'])

            const r = run(RESTORE_DATA, [archive, path.join(dir, 'good'), sha(archive)], { PATH })

            expect(r.status).toBe(0)
            expect(r.out).toContain('sha256 matches')
        })

        it('says so, and stops, when neither is on PATH', () => {
            const { archive, dir } = makeArchive()
            const PATH = shimPath(RESTORE_TOOLS)

            const r = run(RESTORE_DATA, [archive, path.join(dir, 'restored'), sha(archive)], { PATH })

            expect(r.status).toBe(1)
            expect(r.err).toContain('neither sha256sum nor shasum is on PATH')
            expect(fs.existsSync(path.join(dir, 'restored'))).toBe(false)
        })
    })

    describe('deploy/vps-restore.sh (stopped at its prompt; there is no docker on this PATH)', () => {
        const PATH_NO_DOCKER = () => shimPath(['tar', 'gzip', 'awk', 'ls'], {
            docker: 'echo "docker was called: $*" >&2; exit 99',
        })

        it('passes a real-size archive whose snapshot is the first member', () => {
            const { archive } = makeArchive()

            const r = run(VPS_RESTORE, [archive], { PATH: PATH_NO_DOCKER(), input: 'no\n' })

            expect(r.out).toContain('archive OK')
            expect(r.out).toContain('Aborted.')
            expect(r.status).toBe(1)
            expect(r.err).not.toContain('docker was called')
        })

        it('refuses an archive with no snapshot', () => {
            const { archive } = makeArchive({ snapshot: false })

            const r = run(VPS_RESTORE, [archive], { PATH: PATH_NO_DOCKER(), input: 'no\n' })

            expect(r.status).toBe(1)
            expect(r.err).toContain('archive contains no .backup-snapshot.db member')
            expect(r.out).not.toContain('archive OK')
        })
    })
})
