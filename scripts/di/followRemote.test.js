// @vitest-environment node
//
// Gap 2 of the follow gaps found on the owner's install, 2026-10-04/05: with di
// down, `di follow --from https://dev.diiii.xyz` stored the remote WITHOUT its
// /serverXR mount, and every stream then said "could not read both copies".
// The cause is in resolveBase: dev.diiii.xyz answers GET /api/health with its
// web page (200, text/html), and any 200 counted as a di.iiii, so when the real
// /serverXR/api/health dropped one answer the bare address won.
import fsp from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { followSpace } from './follow.mjs'
import { readFollows } from './follows.mjs'
import { resolveBase } from './share.mjs'

const servers = []
afterEach(async () => { while (servers.length) await new Promise((resolve) => servers.pop().close(resolve)) })

/** A host like dev.diiii.xyz: the web page for every path it does not know, the API under /serverXR. */
const startSite = async ({ dropFirstApiHealth = false, apiMounted = true } = {}) => {
    let healthCalls = 0
    const server = http.createServer((req, res) => {
        if (apiMounted && req.url.startsWith('/serverXR/api/health')) {
            healthCalls += 1
            if (dropFirstApiHealth && healthCalls === 1) return req.socket.destroy()
            res.setHeader('Content-Type', 'application/json')
            return res.end(JSON.stringify({ ok: true, startedAt: 1, port: 1 }))
        }
        if (apiMounted && req.url.startsWith('/serverXR/api/spaces/')) {
            res.setHeader('Content-Type', 'application/json')
            return res.end(JSON.stringify({ ops: [], latestVersion: 0 }))
        }
        res.setHeader('Content-Type', 'text/html')
        return res.end('<!DOCTYPE html><html><body>the web page</body></html>')
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    servers.push(server)
    return `http://127.0.0.1:${server.address().port}`
}

describe('a remote is stored only as an address that answers like a di.iiii', () => {
    it('keeps the /serverXR mount when the real health answer is dropped once', async () => {
        const site = await startSite({ dropFirstApiHealth: true })
        expect(await resolveBase(site)).toEqual({ base: `${site}/serverXR`, reason: null })
    })

    it('does not take a web page that answers 200 for a di.iiii', async () => {
        const site = await startSite({ apiMounted: false })
        expect(await resolveBase(site)).toEqual({ base: null, reason: 'unreachable' })
    })

    it('di down, one dropped answer: follows.json holds the address that can be read', async () => {
        const site = await startSite({ dropFirstApiHealth: true })
        const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'di-follow-remote-'))
        const result = await followSpace({ home, spaceId: 'jam', from: site, key: 'k', port: 9, insecure: true })
        expect(result.ok).toBe(true)
        expect(readFollows(path.join(home, 'data')).jam.remote).toBe(`${site}/serverXR`)
    })

    it('di down, nothing here answers as a di.iiii: refused, nothing stored', async () => {
        const site = await startSite({ apiMounted: false })
        const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'di-follow-remote-'))
        const result = await followSpace({ home, spaceId: 'jam', from: site, key: 'k', port: 9, insecure: true })
        expect(result).toEqual({ ok: false, reason: 'unreachable' })
        expect(readFollows(path.join(home, 'data'))).toEqual({})
    })
})
