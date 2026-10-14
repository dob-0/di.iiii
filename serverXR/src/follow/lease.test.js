// @vitest-environment node

// One server per data folder carries the follows (lease.js). Before this, two
// servers on one folder — the installed di and a dev stack, on aylmo — both ran
// a follower for the same space into the same database (2026-10-02).

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createFollowLease, leasePath } = require('./lease.js')

const dirs = []
const makeDataDir = async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'dii-follow-lease-'))
    dirs.push(dir)
    return dir
}
const quiet = { info() {}, warn() {} }

afterEach(async () => {
    await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

describe('the follows lease', () => {
    it('one server holds it; the second on the same folder does not, and is told who does', async () => {
        const dataDir = await makeDataDir()
        const alive = new Set([101, 202])
        const first = createFollowLease({ dataDir, port: 443, pid: 101, hostname: 'aylmo', isAlive: (pid) => alive.has(pid), log: quiet })
        const said = []
        const second = createFollowLease({ dataDir, port: 4000, pid: 202, hostname: 'aylmo', isAlive: (pid) => alive.has(pid), log: { info: (line) => said.push(line), warn() {} } })

        expect((await first.beat()).held).toBe(true)
        const answer = await second.beat()
        expect(answer.held).toBe(false)
        expect(answer.holder).toEqual(expect.objectContaining({ pid: 101, port: 443 }))
        expect(second.describe()).toMatch(/another di\.iiii server on this data folder carries the follows \(pid 101, port 443/)
        // Said once, not on every beat.
        await second.beat()
        expect(said.filter(line => /carries the follows/.test(line))).toHaveLength(1)
        const record = JSON.parse(await readFile(leasePath(dataDir), 'utf8'))
        expect(record).toEqual(expect.objectContaining({ format: 'di.follows-lease', pid: 101, port: 443, hostname: 'aylmo' }))
    })

    it('takes over at once when the holder\'s pid is gone, and the old holder steps down', async () => {
        const dataDir = await makeDataDir()
        const alive = new Set([101, 202])
        const first = createFollowLease({ dataDir, port: 443, pid: 101, hostname: 'aylmo', isAlive: (pid) => alive.has(pid), log: quiet })
        const second = createFollowLease({ dataDir, port: 4000, pid: 202, hostname: 'aylmo', isAlive: (pid) => alive.has(pid), log: quiet })
        await first.beat()
        expect((await second.beat()).held).toBe(false)

        alive.delete(101) // node --watch killed it
        let gained = 0
        expect((await second.beat({ onGain: () => { gained += 1 } })).held).toBe(true)
        expect(gained).toBe(1)

        // If the first comes back with the same identity it must not believe it still carries.
        let lost = 0
        alive.add(101)
        expect((await first.beat({ onLose: () => { lost += 1 } })).held).toBe(false)
        expect(lost).toBe(1)
    })

    it('takes over when the heartbeat is stale, even when the pid cannot be checked (another host)', async () => {
        const dataDir = await makeDataDir()
        let clock = 1_000_000
        const first = createFollowLease({ dataDir, port: 443, pid: 101, hostname: 'other-host', now: () => clock, staleMs: 20_000, log: quiet })
        const second = createFollowLease({ dataDir, port: 4000, pid: 202, hostname: 'aylmo', now: () => clock, staleMs: 20_000, isAlive: () => true, log: quiet })
        await first.beat()
        clock += 10_000
        expect((await second.beat()).held).toBe(false)
        clock += 15_000 // 25 s without a beat
        expect((await second.beat()).held).toBe(true)
    })

    it('a holder that stops gives the lease up, so the next server need not wait', async () => {
        const dataDir = await makeDataDir()
        const first = createFollowLease({ dataDir, port: 443, pid: 101, hostname: 'aylmo', isAlive: () => true, log: quiet })
        const second = createFollowLease({ dataDir, port: 4000, pid: 202, hostname: 'aylmo', isAlive: () => true, log: quiet })
        await first.beat()
        first.stop()
        expect((await second.beat()).held).toBe(true)
    })
})
