// @vitest-environment node
//
// The two update guards (2026-11-26: the desk went back a version, a file install ran ahead of the hub).
import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { commitOrder, devCommitOf, fileUpdateWarning, guardAutoDowngrade } from './updateGuard.mjs'
import { logFile, runAutoUpdate } from './autoupdate.mjs'
import { rollback } from './install.mjs'
import { paths } from './paths.mjs'
import { readState, writeState } from './state.mjs'

const homes = []
const makeHome = async (state = {}) => {
    const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'di-guard-'))
    homes.push(home)
    await writeState(home, state)
    return home
}
afterEach(async () => { while (homes.length) await fsp.rm(homes.pop(), { recursive: true, force: true }) })

const NEW = '0.4.4-dev.a52d757a'
const OLD = '0.4.4-dev.bdf2b70d'
const order = (answer) => async () => answer

describe('the dev commit is read from the version, the order from the branch', () => {
    it('reads the 8 hex digits of a dev build and nothing from a release', () => {
        expect(devCommitOf(NEW)).toBe('a52d757a')
        expect(devCommitOf('0.4.4')).toBeNull()
    })
    it('asks GitHub compare and maps its status; a failure is unknown, never a guess', async () => {
        const reply = (status) => async (url) => { reply.url = url; return { ok: true, json: async () => ({ status }) } }
        expect(await commitOrder({ installed: 'a', target: 'a' })).toBe('same')
        expect(await commitOrder({ installed: 'a52d757a', target: 'bdf2b70d', fetchImpl: reply('behind') })).toBe('behind')
        expect(reply.url).toContain('/compare/a52d757a...bdf2b70d')
        expect(await commitOrder({ installed: 'a', target: 'b', fetchImpl: reply('ahead') })).toBe('ahead')
        expect(await commitOrder({ installed: 'a', target: 'b', fetchImpl: reply('diverged') })).toBe('diverged')
        expect(await commitOrder({ installed: 'a', target: 'b', fetchImpl: reply('identical') })).toBe('same')
        expect(await commitOrder({ installed: 'a', target: 'b', fetchImpl: async () => ({ ok: false }) })).toBe('unknown')
        expect(await commitOrder({ installed: 'a', target: 'b', fetchImpl: async () => { throw new Error('offline') } })).toBe('unknown')
    })
})

describe('(a) the auto-updater never steps back', () => {
    it('lets a newer or the same commit through', async () => {
        expect((await guardAutoDowngrade({ installedVersion: OLD, targetVersion: NEW, order: order('ahead') })).allow).toBe(true)
        expect((await guardAutoDowngrade({ installedVersion: NEW, targetVersion: NEW, order: order('same') })).allow).toBe(true)
    })
    it.each(['behind', 'diverged', 'unknown'])('holds when the target is %s, and names the way to step back on purpose', async (where) => {
        const out = await guardAutoDowngrade({ installedVersion: NEW, targetVersion: OLD, order: order(where) })
        expect(out.allow).toBe(false)
        expect(out.note).toMatch(/^held: /)
        expect(out.note).toContain('--allow-downgrade')
        expect(out.note).toContain('--rollback')
    })
    it('steps back only with the explicit flag, and says so for the log', async () => {
        const out = await guardAutoDowngrade({ installedVersion: NEW, targetVersion: OLD, allowDowngrade: true, order: order('behind') })
        expect(out).toMatchObject({ allow: true, downgrade: true })
        expect(out.note).toContain(`${NEW} -> ${OLD}`)
    })
    it('leaves stable releases to isNewerVersion (not a pair of dev builds)', async () => {
        expect((await guardAutoDowngrade({ installedVersion: '0.4.3', targetVersion: '0.4.4', order: () => { throw new Error('no call') } })).allow).toBe(true)
    })
    it('the timer logs a held tick as `held`, not as failed and not as updated', async () => {
        const home = await makeHome({ channel: 'dev', version: NEW })
        const out = await runAutoUpdate({ home, now: () => new Date('2026-11-26T17:00:00Z'), temp: () => 40, update: async () => ({ code: 0, output: 'held: the hub serves bdf2b70d, older than the running a52d757a — not stepping back.' }) })
        expect(out.outcome).toBe('held')
        expect(out.failed).toBe(false)
        expect(readState(home).autoupdate.lastUpdate ?? null).toBeNull()
        expect(fs.readFileSync(logFile(home), 'utf8')).toContain(' held channel=dev held: the hub serves bdf2b70d')
    })
    it('the CLI runs the timer with --auto, and the guard sits after the rollback door, which never calls it', () => {
        const source = fs.readFileSync(new URL('./cli.mjs', import.meta.url), 'utf8')
        expect(source).toContain("'update', '--channel', channel, '--auto'")
        const rollbackAt = source.indexOf('const to = await rollback({ home })')
        const guardAt = source.indexOf('await guardAutoDowngrade(')
        const returnAt = source.indexOf('if (!to) process.exitCode = 1\n        return', rollbackAt)
        expect(guardAt).toBeGreaterThan(returnAt)
        expect(source.slice(source.indexOf('if (args.flags.rollback)'), returnAt)).not.toContain('guardAutoDowngrade')
        // a hand update only warns; only --auto holds
        expect(source).toContain('if (!guard.allow && args.flags.auto)')
    })
})

describe('the documented rollback (`di update --rollback`) still works with the guard in place', () => {
    it('moves current back to previous by itself, an older commit included, with no guard consulted', async () => {
        const home = await makeHome({ version: NEW })
        const p = paths(home)
        for (const v of [OLD, NEW]) await fsp.mkdir(p.versionDir(v), { recursive: true })
        await fsp.symlink(p.versionDir(NEW), p.current)
        await fsp.symlink(p.versionDir(OLD), p.previous)
        expect(await rollback({ home })).toBe(OLD)
        expect(await fsp.realpath(p.current)).toBe(await fsp.realpath(p.versionDir(OLD)))
        expect(readState(home).version).toBe(OLD)
    })
})

describe('(b) di update --from <file> warns when automatic updates would undo it', () => {
    const hub = (commit) => async () => commit
    it('is silent when automatic updates are off', async () => {
        expect(await fileUpdateWarning({ fileVersion: NEW, autoOn: false, channel: 'dev', hubReader: hub('bdf2b70d11') })).toBeNull()
    })
    it('is silent when the hub serves the file\'s own commit', async () => {
        expect(await fileUpdateWarning({ fileVersion: NEW, autoOn: true, channel: 'dev', hubReader: hub('a52d757a0000') })).toBeNull()
    })
    it('warns loudly, naming both commits and `di autoupdate off`, when the hub serves another commit', async () => {
        const text = await fileUpdateWarning({ fileVersion: NEW, autoOn: true, channel: 'dev', hubReader: hub('bdf2b70d1111') })
        expect(text).toMatch(/^!! /)
        expect(text).toContain('bdf2b70d')
        expect(text).toContain('a52d757a')
        expect(text).toContain('di autoupdate off')
    })
    it('warns too when the hub cannot be read: the risk is the same', async () => {
        const text = await fileUpdateWarning({ fileVersion: NEW, autoOn: true, channel: 'dev', hubReader: async () => { throw new Error('offline') } })
        expect(text).toMatch(/^!! .*could not be read/)
    })
    it('a release file on the stable channel says nothing about the hub', async () => {
        expect(await fileUpdateWarning({ fileVersion: '0.4.4', autoOn: true, channel: 'stable', hubReader: hub('bdf2b70d11') })).toBeNull()
    })
    it('is wired into `di update --from`, before staging', () => {
        const source = fs.readFileSync(new URL('./cli.mjs', import.meta.url), 'utf8')
        expect(source.indexOf('fileUpdateWarning({')).toBeGreaterThan(source.indexOf('releaseFromFile(args.flags.from)'))
        expect(source.indexOf('fileUpdateWarning({')).toBeLessThan(source.indexOf('stageVersion({ home, release'))
    })
})
