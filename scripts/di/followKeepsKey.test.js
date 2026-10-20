// @vitest-environment node
//
// Seen on one install, 2026-10-20 22:19 +04: `di follow di-laser --take-mine`
// alone was refused ("which space, and where from?"), and the re-run with
// --from and --into but no --key wrote the follow down with "token": null. The
// space's edit key (minted 10-04) was gone, and the host refused every edit
// after. A missing --key means "not said", never "no key".
import { spawn } from 'node:child_process'
import fsp from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { followSpace } from './follow.mjs'
import { addFollow, readFollows } from './follows.mjs'
import { ui } from './ui.mjs'

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cli.mjs')

const servers = []
afterAll(async () => { while (servers.length) await new Promise((resolve) => servers.pop().close(resolve)) })

// Every install made here is removed after the run: each holds a follows.json with a key in it.
const homes = []
afterAll(async () => { while (homes.length) await fsp.rm(homes.pop(), { recursive: true, force: true }) })
const tempHome = async () => {
    const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'di-follow-key-'))
    homes.push(home)
    return home
}

/** A di.iiii whose space opens only to `key`, so a follow with no key is refused like the real host refused. */
const startHost = async (key) => {
    const server = http.createServer((req, res) => {
        res.setHeader('Content-Type', 'application/json')
        if (req.url.startsWith('/serverXR/api/health')) return res.end(JSON.stringify({ ok: true, startedAt: 1, port: 1 }))
        if (req.url.startsWith('/serverXR/api/spaces/')) {
            const sent = String(req.headers.authorization || req.headers['x-sync-key'] || '')
            if (!sent.includes(key)) { res.statusCode = 403; return res.end('{"error":"denied"}') }
            return res.end(JSON.stringify({ ops: [], latestVersion: 0 }))
        }
        res.statusCode = 404
        return res.end('{}')
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    servers.push(server)
    return `http://127.0.0.1:${server.address().port}`
}

/** Something at the address that is not a di.iiii answering: every follow to it is refused as unreachable. */
const startDownHost = async () => {
    const server = http.createServer((req, res) => { res.statusCode = 503; res.end('{}') })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    servers.push(server)
    return `http://127.0.0.1:${server.address().port}`
}

let hostA
let hostB
beforeAll(async () => {
    hostA = await startHost('dii_sync_a')
    hostB = await startHost('dii_sync_b')
})

/** An install already following `di-laser` from host A with A's key and a label — the record from 10-04. */
const followedHome = async () => {
    const home = await tempHome()
    const data = path.join(home, 'data')
    await fsp.mkdir(data, { recursive: true })
    await addFollow(data, 'di-laser', { remote: `${hostA}/serverXR`, token: 'dii_sync_a', label: 'laser desk' })
    return { home, data }
}

describe('a re-run of di follow without --key keeps the edit key', () => {
    it('same remote, no --key: the stored key and label stay, and it says so', async () => {
        const { home, data } = await followedHome()
        const result = await followSpace({ home, spaceId: 'di-laser', from: hostA, into: 'di-laser', port: 9, direction: 'take-mine' })
        expect(result.ok).toBe(true)
        expect(result.keptKey).toBe(true)
        const after = readFollows(data)['di-laser']
        expect(after.token).toBe('dii_sync_a')
        expect(after.label).toBe('laser desk')
        expect(after.direction).toBe('take-mine')
        expect(ui.followKeptKey()).toMatch(/kept the stored edit key/)
    })

    it('another remote, no --key: refused, both remotes named, the record untouched', async () => {
        const { home, data } = await followedHome()
        const before = await fsp.readFile(path.join(data, 'follows.json'), 'utf8')
        const result = await followSpace({ home, spaceId: 'di-laser', from: hostB, into: 'di-laser', port: 9 })
        expect(result).toEqual({ ok: false, reason: 'remote-differs', stored: `${hostA}/serverXR`, base: `${hostB}/serverXR` })
        expect(await fsp.readFile(path.join(data, 'follows.json'), 'utf8')).toBe(before)
        const line = ui.followRemoteDiffers('di-laser', result.stored, result.base)
        expect(line).toContain(`${hostA}/serverXR`)
        expect(line).toContain(`${hostB}/serverXR`)
        expect(line).toContain('--key')
    })

    it('an explicit key (as --key - reads it) still replaces the stored one', async () => {
        const { home, data } = await followedHome()
        const result = await followSpace({ home, spaceId: 'di-laser', from: hostB, key: 'dii_sync_b', into: 'di-laser', port: 9 })
        expect(result.ok).toBe(true)
        expect(result.keptKey).toBe(false)
        const after = readFollows(data)['di-laser']
        expect(after.remote).toBe(`${hostB}/serverXR`)
        expect(after.token).toBe('dii_sync_b')
    })

    it('a space never followed, no --key: as before, no key is stored', async () => {
        const home = await tempHome()
        const open = await startHost('')
        const result = await followSpace({ home, spaceId: 'jam', from: open, port: 9 })
        expect(result.ok).toBe(true)
        expect(result.keptKey).toBe(false)
        expect(readFollows(path.join(home, 'data')).jam.token).toBe(null)
    })

    it('same remote on a host that lets anyone read, no --key: the key stays, never written as null', async () => {
        // The defect itself: the real host let the keyless check read the space
        // and refused only the edits after, so the follow was written down with
        // "token": null. This host opens to any key or none, as that one did.
        const open = await startHost('')
        const home = await tempHome()
        const data = path.join(home, 'data')
        await addFollow(data, 'di-laser', { remote: `${open}/serverXR`, token: 'dii_sync_a', label: 'laser desk' })
        const result = await followSpace({ home, spaceId: 'di-laser', from: open, into: 'di-laser', port: 9, direction: 'take-mine' })
        expect(result.ok).toBe(true)
        expect(readFollows(data)['di-laser'].token).toBe('dii_sync_a')
        expect(result.keptKey).toBe(true)
    })
})

describe('--take-mine / --take-host alone use the follow already there', () => {
    it('the short --take-mine form finds the follow: its remote, its key', async () => {
        const { home, data } = await followedHome()
        const result = await followSpace({ home, spaceId: 'di-laser', port: 9, direction: 'take-mine' })
        expect(result.ok).toBe(true)
        expect(result.base).toBe(`${hostA}/serverXR`)
        const after = readFollows(data)['di-laser']
        expect(after.token).toBe('dii_sync_a')
        expect(after.direction).toBe('take-mine')
    })

    it('a space not followed here, no --from: refused, nothing written', async () => {
        const home = await tempHome()
        expect(await followSpace({ home, spaceId: 'di-laser', port: 9, direction: 'take-host' }))
            .toEqual({ ok: false, reason: 'no-from' })
        await expect(fsp.stat(path.join(home, 'data', 'follows.json'))).rejects.toThrow()
    })

    it('no direction and no --from is still a question, even on a followed space', async () => {
        const { home } = await followedHome()
        expect(await followSpace({ home, spaceId: 'di-laser', port: 9 })).toEqual({ ok: false, reason: 'no-from' })
    })
})

describe('`di follow <space> --take-mine` itself: it names the follow it took, and never prints the key', () => {
    /** An installed di (made as followAt.test.js makes one) already following di-laser. Its own port, 9, answers
     * nothing, so it counts as not running and nothing here talks to a real di on this machine. */
    const installedHome = async (follow) => {
        const home = await tempHome()
        await fsp.mkdir(path.join(home, 'versions', '7.7.7-test'), { recursive: true })
        await fsp.symlink(path.join(home, 'versions', '7.7.7-test'), path.join(home, 'current'))
        await fsp.writeFile(path.join(home, 'state.json'), JSON.stringify({ mode: 'node', version: '7.7.7-test' }))
        await fsp.writeFile(path.join(home, 'di.env'), 'PORT=9\n')
        await addFollow(path.join(home, 'data'), 'di-laser', follow)
        return home
    }

    /** `di …` as a child that does not block this process: the hosts it asks answer from here. */
    const di = (home, args) => new Promise((resolve) => {
        const child = spawn(process.execPath, [CLI, ...args], {
            env: { ...process.env, DI_HOME: home, DI_NO_COLOR: '1' },
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 15000
        })
        let out = ''
        let err = ''
        child.stdout.on('data', (chunk) => { out += chunk })
        child.stderr.on('data', (chunk) => { err += chunk })
        child.on('close', (code) => resolve({ code, out, err }))
    })

    it('kept: says so, names the address pin it took from the follow, and prints no key', async () => {
        const home = await installedHome({ remote: `${hostA}/serverXR`, token: 'dii_sync_a', address: '127.0.0.1' })
        const { code, out, err } = await di(home, ['follow', 'di-laser', '--take-mine'])
        expect(code, err).toBe(0)
        expect(out).toContain('kept the stored edit key')
        expect(out).toContain('the socket goes to 127.0.0.1')
        expect(out + err).not.toContain('dii_sync_a')
        expect(readFollows(path.join(home, 'data'))['di-laser']).toMatchObject({ token: 'dii_sync_a', address: '127.0.0.1', direction: 'take-mine' })
    }, 20000)

    it('refused: names the stored remote, never "undefined", and prints no key', async () => {
        const down = await startDownHost()
        const home = await installedHome({ remote: `${down}/serverXR`, token: 'dii_sync_a', address: '127.0.0.1' })
        const { code, out, err } = await di(home, ['follow', 'di-laser', '--take-mine'])
        expect(code).toBe(1)
        expect(err).toContain(`nothing answers at ${down}/serverXR`)
        expect(err).not.toContain('undefined')
        // The pin was used already, so the "say where it is: --at" hint is not offered.
        expect(err).not.toContain('--at <address>')
        expect(out + err).not.toContain('dii_sync_a')
    }, 20000)
})
