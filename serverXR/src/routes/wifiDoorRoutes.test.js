// @vitest-environment node
// /api/wifi-door is the owner's: the person at the machine, by a local name — never a wifi-door request.
import { describe, expect, it } from 'vitest'
import express from 'express'
import http from 'node:http'

import { registerWifiDoorRoutes, isOwnerRequest } from './wifiDoorRoutes.js'

const fakeDoor = () => {
    const door = { isOpen: false, calls: [] }
    return Object.assign(door, {
        open: async () => { door.calls.push('open'); if (door.refuse) return { ok: false, reason: door.refuse }; door.isOpen = true; return { ok: true } },
        close: async () => { door.calls.push('close'); door.isOpen = false; return { ok: true } },
        status: () => ({ open: door.isOpen, name: 'n.z', address: null, port: null, since: null })
    })
}
const run = async (door, isOwner, method, headers = {}) => {
    const app = express(); const router = express.Router(); registerWifiDoorRoutes(router, { door, isOwner }); app.use(router)
    const server = http.createServer(app); await new Promise((r) => server.listen(0, '127.0.0.1', r))
    try {
        return await new Promise((resolve, reject) => {
            const req = http.request({ host: '127.0.0.1', port: server.address().port, path: '/api/wifi-door', method, headers }, (res) => {
                let b = ''; res.on('data', (c) => { b += c }); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(b || '{}') }))
            }); req.on('error', reject); req.end()
        })
    } finally { server.close() }
}

describe('/api/wifi-door', () => {
    it('GET answers the state to the owner', async () => {
        expect((await run(fakeDoor(), () => true, 'GET')).body).toMatchObject({ open: false, name: 'n.z' })
    })
    it('POST opens, DELETE closes', async () => {
        const door = fakeDoor()
        expect((await run(door, () => true, 'POST')).body.open).toBe(true)
        expect((await run(door, () => true, 'DELETE')).body.open).toBe(false)
        expect(door.calls).toEqual(['open', 'close'])
    })
    it('a refusal is a 409 with the reason', async () => {
        const door = fakeDoor(); door.refuse = 'no-name'
        const r = await run(door, () => true, 'POST')
        expect(r.status).toBe(409); expect(r.body.error).toBe('no-name')
    })
    it('a non-owner gets 403 on all three and nothing moves', async () => {
        const door = fakeDoor()
        for (const m of ['GET', 'POST', 'DELETE']) expect((await run(door, () => false, m)).status).toBe(403)
        expect(door.calls).toEqual([])
    })
})

describe('who is the owner here', () => {
    const owner = () => true
    const req = (headers, extra = {}) => ({ headers, ...extra })
    it('a local name, no origin: yes', () => expect(isOwnerRequest(req({ host: 'diiii.localhost' }), owner)).toBe(true))
    it('127.0.0.1 with its own origin: yes', () => expect(isOwnerRequest(req({ host: '127.0.0.1:4000', origin: 'http://diiii.localhost' }), owner)).toBe(true))
    it('a foreign Host (DNS rebinding): no', () => expect(isOwnerRequest(req({ host: 'evil.example' }), owner)).toBe(false))
    it('a foreign Origin: no', () => expect(isOwnerRequest(req({ host: 'diiii.localhost', origin: 'https://evil.example' }), owner)).toBe(false))
    it('through the wifi door: no', () => expect(isOwnerRequest(req({ host: 'diiii.localhost' }, { diWifiDoor: true }), owner)).toBe(false))
    it('not at the machine: no', () => expect(isOwnerRequest(req({ host: 'diiii.localhost' }), () => false)).toBe(false))
})
