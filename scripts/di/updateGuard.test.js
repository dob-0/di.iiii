// @vitest-environment node
//
// The two update guards (2026-11-26: the desk went back a version, a file install ran ahead of the hub).
import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { cachedOrder, commitOrder, decideDevUpdate, devCommitOf, fileUpdateWarning, runningCommitOf } from './updateGuard.mjs'
import { lockFile, startOf, takeUpdateLock } from './updateLock.mjs'
import { COMMANDS } from './cli.mjs'
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
    const decide = (over) => decideDevUpdate({ installedVersion: NEW, runningCommit: 'a52d757a' + '0'.repeat(32), targetVersion: OLD, auto: true, order: order('behind'), ...over })
    it('lets a newer or the same commit through', async () => {
        expect((await decide({ targetVersion: NEW, order: order('ahead') })).action).toBe('install')
        expect((await decide({ targetVersion: NEW, order: order('same') })).action).toBe('install')
    })
    it.each(['behind', 'diverged', 'unknown'])('the timer holds when the target is %s, and names the way to step back on purpose', async (where) => {
        const out = await decide({ order: order(where) })
        expect(out.action).toBe('hold')
        expect(out.note).toMatch(/^held: /)
        expect(out.note).toContain('--allow-downgrade')
        expect(out.note).toContain('--rollback')
    })
    it('steps back on the timer only with the explicit flag, and says so for the log', async () => {
        const out = await decide({ allowDowngrade: true })
        expect(out).toMatchObject({ action: 'install', stepsBack: true })
        expect(out.note).toContain(`${NEW} -> ${OLD}`)
    })
    it('a hand update goes on but says it steps back and asks to log it', async () => {
        const out = await decide({ auto: false })
        expect(out).toMatchObject({ action: 'install', stepsBack: true })
        expect(out.note).toContain('this steps back')
    })
    it.each(['0.4.4', '0.4.4-dev.7aa009bf-aim', '0.4.4-dev.7AA009BF', '0.4.4-dev.7aa009b', null])(
        'the timer holds when the running build cannot name its commit (version %s)', async (version) => {
            const out = await decide({ installedVersion: version, runningCommit: null, targetVersion: OLD, order: order('behind') })
            expect(out.action).toBe('hold')
            expect(out.note).toContain('does not say which commit')
        })
    it('the running commit comes from the build, not from the version string', async () => {
        let asked
        await decide({ installedVersion: '0.4.4', runningCommit: 'a52d757aff', order: async (pair) => { asked = pair; return 'ahead' } })
        expect(asked).toEqual({ installed: 'a52d757a', target: 'bdf2b70d' })
    })
    it('the timer holds on a hub build that names no commit', async () => {
        expect((await decide({ targetVersion: '0.4.4' })).action).toBe('hold')
    })
    it('reads the running commit from current/release.json, null when unreadable', async () => {
        const home = await makeHome()
        expect(runningCommitOf(home)).toBeNull()
        const dir = paths(home).versionDir(NEW)
        await fsp.mkdir(dir, { recursive: true })
        await fsp.symlink(dir, paths(home).current)
        expect(runningCommitOf(home)).toBeNull()
        await fsp.writeFile(path.join(dir, 'release.json'), JSON.stringify({ gitCommit: '66BEC814ffe70605be89f00f93edceee55da097d' }))
        expect(runningCommitOf(home)).toBe('66bec814ffe70605be89f00f93edceee55da097d')
        await fsp.writeFile(path.join(dir, 'release.json'), JSON.stringify({ gitCommit: 'nope' }))
        expect(runningCommitOf(home)).toBeNull()
    })
    it('asks GitHub once per pair of commits, keeps only real answers', async () => {
        let store = {}
        let calls = 0
        const inner = async () => { calls += 1; return calls === 1 ? 'unknown' : 'behind' }
        const ask = cachedOrder({ read: () => store, write: async (next) => { store = next }, inner })
        let clock = 1000
        const timed = cachedOrder({ read: () => store, write: async (next) => { store = next }, inner, now: () => clock })
        expect(await timed({ installed: 'a', target: 'b' })).toBe('unknown')
        expect(await timed({ installed: 'a', target: 'b' })).toBe('unknown') // a 404 is not asked again within the hour
        expect(calls).toBe(1)
        clock += 61 * 60 * 1000
        expect(await timed({ installed: 'a', target: 'b' })).toBe('behind')
        expect(await ask({ installed: 'a', target: 'b' })).toBe('behind')
        expect(await ask({ installed: 'a', target: 'b' })).toBe('behind')
        expect(await ask({ installed: 'c', target: 'c' })).toBe('same')
        expect(calls).toBe(2)
    })
    it('the installed version is re-read before the server stops and before the flip', () => {
        const source = fs.readFileSync(new URL('./cli.mjs', import.meta.url), 'utf8')
        const checks = [...source.matchAll(/if \(movedUnderUs\(\)\)/g)].map((m) => m.index)
        const stop = source.indexOf('try { await runner.stop({ home }) } catch', checks[0])
        const flip = source.indexOf('await activate({ home, ...staged')
        expect(checks.length).toBe(2)
        expect(checks[0]).toBeLessThan(stop)
        expect(checks[1]).toBeGreaterThan(stop)
        expect(checks[1]).toBeLessThan(flip)
    })
    it('the cache stays small', async () => {
        let store = {}
        const ask = cachedOrder({ read: () => store, write: async (next) => { store = next }, inner: async () => 'ahead', max: 3 })
        for (const t of ['1', '2', '3', '4']) await ask({ installed: 'a', target: t })
        expect(Object.keys(store)).toEqual(['a...2', 'a...3', 'a...4'])
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
        const guardAt = source.indexOf('await decideDevUpdate(')
        const returnAt = source.indexOf('if (!to) process.exitCode = 1\n        return', rollbackAt)
        expect(guardAt).toBeGreaterThan(returnAt)
        expect(source.slice(source.indexOf('if (args.flags.rollback)'), returnAt)).not.toContain('decideDevUpdate')
    })
})

// The real `di update` command (cmdUpdate) with the network replaced: what it fetches says what it did.
describe('`di update` end to end, network faked: the wiring does what the guard decides', () => {
    const RUN = '0.4.4-dev.66bec814'
    const HUB_OLD = '7aa009bf'
    const HUB_NEW = 'f2d24329'
    let fetched
    const realFetch = globalThis.fetch
    const fakeNetwork = ({ hubCommit, status }) => {
        fetched = []
        globalThis.fetch = async (url) => {
            const u = String(url)
            fetched.push(u)
            const json = (body) => ({ ok: true, status: 200, headers: new Headers(), json: async () => body, text: async () => JSON.stringify(body) })
            if (u.endsWith('/api/health')) return json({ release: { gitCommit: `${hubCommit}${'0'.repeat(32)}` } })
            if (u.includes('/compare/')) return json({ status })
            if (u.endsWith('checksums.txt')) return { ok: true, status: 200, headers: new Headers(), text: async () => `abc  di-runtime-0.4.4-dev.${hubCommit}.tar.gz\n` }
            return { ok: false, status: 500, headers: new Headers(), text: async () => 'no' } // the tarball: staging starts here
        }
    }
    const installed = async () => {
        const home = await makeHome({ mode: 'node', version: RUN, channel: 'dev' })
        const dir = paths(home).versionDir(RUN)
        await fsp.mkdir(dir, { recursive: true })
        await fsp.writeFile(path.join(dir, 'release.json'), JSON.stringify({ gitCommit: `66bec814${'f'.repeat(32)}` }))
        await fsp.symlink(dir, paths(home).current)
        return home
    }
    const run = async (home, flags) => {
        const out = []
        const write = process.stdout.write.bind(process.stdout)
        const oldHome = process.env.DI_HOME
        process.env.DI_HOME = home
        process.stdout.write = (chunk) => { out.push(String(chunk)); return true }
        const errWrite = process.stderr.write.bind(process.stderr)
        process.stderr.write = (chunk) => { out.push(String(chunk)); return true }
        try { await COMMANDS.update({ _: [], flags: { channel: 'dev', ...flags } }) } finally {
            process.stdout.write = write
            process.stderr.write = errWrite
            if (oldHome === undefined) delete process.env.DI_HOME; else process.env.DI_HOME = oldHome
            process.exitCode = 0
        }
        return out.join('')
    }
    const staged = () => fetched.some((u) => u.endsWith('.tar.gz'))
    afterEach(() => { globalThis.fetch = realFetch })

    it('timer, hub behind: prints held, returns before staging anything', async () => {
        fakeNetwork({ hubCommit: HUB_OLD, status: 'behind' })
        const home = await installed()
        const text = await run(home, { auto: true })
        expect(text).toMatch(/held: the hub serves 7aa009bf, older than the running 66bec814/)
        expect(staged()).toBe(false)
        expect(readState(home).version).toBe(RUN)
        expect(fs.existsSync(path.join(home, 'update.lock'))).toBe(false)
    })
    it('timer, hub ahead: goes on to install (the tarball is asked for)', async () => {
        fakeNetwork({ hubCommit: HUB_NEW, status: 'ahead' })
        await run(await installed(), { auto: true })
        expect(staged()).toBe(true)
    })
    it('timer, hub diverged: held', async () => {
        fakeNetwork({ hubCommit: HUB_NEW, status: 'diverged' })
        const text = await run(await installed(), { auto: true })
        expect(text).toContain('held: ')
        expect(staged()).toBe(false)
    })
    it('timer with --allow-downgrade, hub behind: installs (flag is not inverted)', async () => {
        fakeNetwork({ hubCommit: HUB_OLD, status: 'behind' })
        await run(await installed(), { auto: true, 'allow-downgrade': true })
        expect(staged()).toBe(true)
    })
    it('a hand update with the hub behind says it steps back and goes on', async () => {
        fakeNetwork({ hubCommit: HUB_OLD, status: 'behind' })
        const text = await run(await installed(), {})
        expect(text).toContain('this steps back')
        expect(staged()).toBe(true)
    })
    it('timer, running build with no readable commit: held, nothing staged', async () => {
        fakeNetwork({ hubCommit: HUB_NEW, status: 'ahead' })
        const home = await installed()
        await fsp.rm(path.join(paths(home).versionDir(RUN), 'release.json'))
        const text = await run(home, { auto: true })
        expect(text).toContain('held: the running build does not say which commit')
        expect(staged()).toBe(false)
    })
    it('a held pair asks GitHub once, not on every tick', async () => {
        fakeNetwork({ hubCommit: HUB_OLD, status: 'behind' })
        const home = await installed()
        await run(home, { auto: true })
        await run(home, { auto: true })
        expect(fetched.filter((u) => u.includes('/compare/')).length).toBe(1)
    })
    it('timer while another install holds the lock: held, nothing fetched', async () => {
        fakeNetwork({ hubCommit: HUB_NEW, status: 'ahead' })
        const home = await installed()
        await fsp.writeFile(lockFile(home), JSON.stringify({ pid: process.pid, start: startOf(process.pid), at: new Date().toISOString() }))
        const text = await run(home, { auto: true })
        expect(text).toContain('held: another install is running')
        expect(fetched).toEqual([])
        expect(fs.existsSync(lockFile(home))).toBe(true) // not ours: left alone
    })
})

describe('the update lock', () => {
    it('is exclusive, released by its owner, and a dead holder is taken over', async () => {
        const home = await makeHome()
        const first = await takeUpdateLock({ home })
        expect(first.ok).toBe(true)
        const second = await takeUpdateLock({ home })
        expect(second.ok).toBe(false)
        expect(second.holder.pid).toBe(process.pid)
        await first.release()
        expect(fs.existsSync(lockFile(home))).toBe(false)
        await fsp.writeFile(lockFile(home), JSON.stringify({ pid: 2 ** 22 + 12345, at: new Date().toISOString() }))
        const third = await takeUpdateLock({ home })
        expect(third.ok).toBe(true)
        await third.release()
    })
    it('a lock older than 3 hours is stale even when its pid is alive', async () => {
        const home = await makeHome()
        await fsp.writeFile(lockFile(home), JSON.stringify({ pid: process.pid, start: startOf(process.pid), at: new Date(Date.now() - 4 * 3600e3).toISOString() }))
        expect((await takeUpdateLock({ home })).ok).toBe(true)
    })
    it('a lock whose pid is alive but is another process now (pid reuse) is stale at once', async () => {
        const home = await makeHome()
        await fsp.writeFile(lockFile(home), JSON.stringify({ pid: 1, start: 'not-pid-1', at: new Date(Date.now() - 3600e3).toISOString() }))
        expect((await takeUpdateLock({ home })).ok).toBe(true)
        await fsp.writeFile(lockFile(home), JSON.stringify({ pid: 1, at: new Date(Date.now() - 3600e3).toISOString() }))
        expect((await takeUpdateLock({ home })).ok).toBe(true) // no start recorded: not one of ours
    })
    it('an unreadable lock younger than a minute is held, an old one is stale', async () => {
        const home = await makeHome()
        await fsp.writeFile(lockFile(home), '')
        const r = await takeUpdateLock({ home })
        expect(r.ok).toBe(false)
        expect(r.file).toBe(lockFile(home))
        const old = new Date(Date.now() - 120e3)
        await fsp.utimes(lockFile(home), old, old)
        expect((await takeUpdateLock({ home })).ok).toBe(true)
    })
    it('release leaves another holder\'s lock alone', async () => {
        const home = await makeHome()
        const mine = await takeUpdateLock({ home, pid: process.pid })
        await fsp.writeFile(lockFile(home), JSON.stringify({ pid: 424242, start: '1', at: new Date().toISOString() }))
        await mine.release()
        expect(fs.existsSync(lockFile(home))).toBe(true)
    })
    it('8 processes at once: exactly one holder, with and without a dead lock before', async () => {
        const home = await makeHome()
        const child = path.join(home, 'child.mjs')
        const mod = new URL('./updateLock.mjs', import.meta.url).href
        await fsp.writeFile(child, `import { takeUpdateLock } from '${mod}'\nconst r = await takeUpdateLock({ home: process.argv[2] })\nprocess.stdout.write(r.ok ? 'OK' : 'NO')\nif (r.ok) await new Promise((res) => setTimeout(res, 400))\n`)
        const { execFile } = await import('node:child_process')
        const runAll = () => Promise.all(Array.from({ length: 8 }, () => new Promise((resolve) => execFile(process.execPath, [child, home], (e, out) => resolve(out)))))
        for (const dead of [false, true]) {
            await fsp.rm(lockFile(home), { force: true })
            if (dead) await fsp.writeFile(lockFile(home), JSON.stringify({ pid: 2 ** 22 + 99, start: '1', at: new Date().toISOString() }))
            const outs = await runAll()
            expect(outs.filter((o) => o === 'OK').length).toBe(1)
        }
    })
    it('a failed update still frees the lock (cmdUpdate holds it in try/finally)', () => {
        const source = fs.readFileSync(new URL('./cli.mjs', import.meta.url), 'utf8')
        expect(source).toContain('try { await cmdUpdateLocked(args, home) } finally { await lock.release() }')
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
    it('the warning says the timer replaces this install only when the hub is newer', async () => {
        const text = await fileUpdateWarning({ fileVersion: NEW, autoOn: true, channel: 'dev', hubReader: hub('bdf2b70d1111') })
        expect(text).toContain('only when the hub\'s commit is newer')
    })
    it('is wired into `di update --from`, before staging', () => {
        const source = fs.readFileSync(new URL('./cli.mjs', import.meta.url), 'utf8')
        expect(source.indexOf('fileUpdateWarning({')).toBeGreaterThan(source.indexOf('releaseFromFile(args.flags.from)'))
        expect(source.indexOf('fileUpdateWarning({')).toBeLessThan(source.indexOf('stageVersion({ home, release'))
    })
})
