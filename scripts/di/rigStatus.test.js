// @vitest-environment node
//
// `di status` says whether the other di.iiii on this network can see this one.
//
// 2026-09-24: three copies on 192.168.88.x, one of them invisible by design
// (device routes closed, so no discovery and a 403 to every peer) and nothing
// anywhere said so. The server now works the answer out once
// (serverXR/src/rig/visibility.js); this is the CLI half — asking for it and
// printing it with the command that changes it.
import http from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'

import { probeRig } from './probe.mjs'
import { CMD, ui } from './ui.mjs'
import cli from './cli.mjs?raw'

// eslint-disable-next-line no-control-regex
const plain = (text) => String(text).replace(/\u001b\[[0-9;]*m/g, '')

const servers = []
afterEach(async () => {
    while (servers.length) await new Promise((resolve) => servers.pop().close(resolve))
})

const serve = async (handler) => {
    const server = http.createServer(handler)
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    servers.push(server)
    return server.address().port
}

describe('probeRig', () => {
    it('returns the server\'s answer', async () => {
        const port = await serve((req, res) => {
            expect(req.url).toBe('/serverXR/api/rig/visibility')
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ rig: 1, visible: false, reason: 'loopback', discovery: 'off', members: 0, nearby: [] }))
        })
        expect(await probeRig(port)).toMatchObject({ visible: false, reason: 'loopback' })
    })

    it('reads a 403 as "private, refused" — only a private copy refuses', async () => {
        const port = await serve((_req, res) => { res.statusCode = 403; res.end('{"error":"local runtime is loopback-only"}') })
        expect(await probeRig(port)).toEqual({ visible: false, refused: true })
    })

    it('is null for a server without the route (older, or DI_RIG=0), and for nothing listening', async () => {
        const port = await serve((_req, res) => { res.statusCode = 404; res.end() })
        expect(await probeRig(port)).toBeNull()
        const closed = await serve(() => {})
        await new Promise((resolve) => servers.pop().close(resolve))
        expect(await probeRig(closed)).toBeNull()
    })
})

describe('ui.rigVisibility', () => {
    it('private: says so, says what it heard, and names the command', () => {
        const text = plain(ui.rigVisibility({
            visible: false, reason: 'devices-closed', discovery: 'listening', members: 0,
            nearby: [{ id: 'a', name: 'aylmo', address: '192.168.88.231', open: true }, { id: 'w', name: 'DESKTOP-MGGLB2C', address: '192.168.88.140', open: true }]
        }))
        expect(text).toMatch(/^rig: private — other di\.iiii on this network cannot see this one/)
        expect(text).toMatch(/discovery listening · heard 2 other di\.iiii on this network: 192\.168\.88\.231 \(aylmo\), 192\.168\.88\.140 \(DESKTOP-MGGLB2C\)/)
        expect(text).toContain(`to change: ${CMD} down, then ${CMD} up --lan`)
    })

    it('private with discovery off (a loopback start) still names the command', () => {
        const text = plain(ui.rigVisibility({ visible: false, reason: 'loopback', discovery: 'off', members: 0, nearby: [] }))
        expect(text).toMatch(/discovery off/)
        expect(text).toContain(`${CMD} up --lan`)
    })

    it('visible: discovery, the member count, the way back, and every private copy it heard by address', () => {
        const text = plain(ui.rigVisibility({
            visible: true, reason: 'open', discovery: 'on', members: 1,
            nearby: [{ id: 'p', name: 'ponyo', address: '192.168.88.125', open: false, via: 'beacon' }]
        }))
        expect(text).toMatch(/^rig: visible on this network · discovery on · 1 member/)
        expect(text).toContain(`to make it private: ${CMD} down, then ${CMD} up`)
        expect(text).toContain('a di.iiii at 192.168.88.125 (ponyo) is on this network but private')
    })

    it('no answer is said, not skipped', () => {
        expect(plain(ui.rigVisibility(null))).toMatch(/^rig: no answer/)
    })
})

describe('di status asks', () => {
    it('cmdStatus prints the rig line from the server\'s answer', () => {
        const status = cli.slice(cli.indexOf('const cmdStatus'), cli.indexOf('const cmdOpen'))
        expect(status).toContain('probeRig(')
        expect(status).toContain('ui.rigVisibility(')
    })
})
