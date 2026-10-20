// @vitest-environment node
//
// Seen on one install, 2026-10-20 22:19 +04: `di follow di-laser --take-mine`
// alone was refused ("which space, and where from?"), and the re-run with
// --from and --into but no --key wrote the follow down with "token": null. The
// space's edit key (minted 10-04) was gone, and the host refused every edit
// after. A missing --key means "not said", never "no key".
import fsp from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { followSpace } from './follow.mjs'
import { addFollow, readFollows } from './follows.mjs'
import { ui } from './ui.mjs'

const servers = []
afterAll(async () => { while (servers.length) await new Promise((resolve) => servers.pop().close(resolve)) })

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

let hostA
let hostB
beforeAll(async () => {
    hostA = await startHost('dii_sync_a')
    hostB = await startHost('dii_sync_b')
})

/** An install already following `di-laser` from host A with A's key and a label — the record from 10-04. */
const followedHome = async () => {
    const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'di-follow-key-'))
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
        const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'di-follow-key-'))
        const open = await startHost('')
        const result = await followSpace({ home, spaceId: 'jam', from: open, port: 9 })
        expect(result.ok).toBe(true)
        expect(result.keptKey).toBe(false)
        expect(readFollows(path.join(home, 'data')).jam.token).toBe(null)
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
        const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'di-follow-key-'))
        expect(await followSpace({ home, spaceId: 'di-laser', port: 9, direction: 'take-host' }))
            .toEqual({ ok: false, reason: 'no-from' })
        await expect(fsp.stat(path.join(home, 'data', 'follows.json'))).rejects.toThrow()
    })

    it('no direction and no --from is still a question, even on a followed space', async () => {
        const { home } = await followedHome()
        expect(await followSpace({ home, spaceId: 'di-laser', port: 9 })).toEqual({ ok: false, reason: 'no-from' })
    })
})
