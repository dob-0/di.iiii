// @vitest-environment node

import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const express = require('express')
const { createMachineHub, viaLink } = require('./hub.js')
const { registerMachineRoutes } = require('./routes.js')
const { getMachine, forgetMachines } = require('../machineIdentity.js')

const SPACE = 'shared-room'
const HERE = { id: 'machine-here', name: 'aylmo' }
const cleanups = []

afterEach(async () => {
    while (cleanups.length) await cleanups.pop()()
})

const boot = async ({ auth = null, forward = async () => ({ status: 200, payload: { ok: true } }) } = {}) => {
    const hub = createMachineHub()
    const forwarded = []
    const app = express()
    app.use(express.json())
    const router = express.Router()
    registerMachineRoutes(router, {
        hub,
        machine: () => HERE,
        requireAuth: () => Boolean(auth),
        getAuthState: () => auth || {},
        hasRequiredAuthRole: (role, required) => required === 'editor' ? ['editor', 'admin'].includes(role) : role === 'admin',
        canAccessSpace: (state, spaceId) => !state.spaces || state.spaces.includes(spaceId),
        normalizeSpaceId: (value) => value,
        spaceExists: async (spaceId) => spaceId !== 'missing',
        forward: async (link, body) => { forwarded.push({ link, body }); return forward(link, body) }
    })
    app.use(router)
    const server = await new Promise((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s))
    })
    cleanups.push(() => new Promise((resolve) => server.close(resolve)))
    const base = `http://127.0.0.1:${server.address().port}`
    const call = async (method, route, body) => {
        const response = await fetch(`${base}${route}`, {
            method,
            headers: body ? { 'Content-Type': 'application/json' } : {},
            body: body ? JSON.stringify(body) : undefined
        })
        return { status: response.status, body: await response.json() }
    }
    return { hub, call, forwarded }
}

describe('machine routes', () => {
    it('hello answers with this machine and every live peer', async () => {
        const { hub, call } = await boot()
        hub.recordRemotePeers(SPACE, viaLink('http://host'), [{ peerId: 'there', machineId: 'h', machineName: 'asuz' }])
        const answer = await call('POST', `/api/spaces/${SPACE}/machines/hello`, { peerId: 'tab', role: 'viewer' })
        expect(answer.status).toBe(200)
        expect(answer.body.machine).toEqual(HERE)
        expect(answer.body.peers.map(peer => [peer.peerId, peer.machineName]).sort()).toEqual([['tab', 'aylmo'], ['there', 'asuz']])
        expect((await call('GET', `/api/spaces/${SPACE}/machines`)).body.peers).toHaveLength(2)
    })

    it('delivers to a local tab, and the tab collects it', async () => {
        const { call } = await boot()
        await call('POST', `/api/spaces/${SPACE}/machines/hello`, { peerId: 'a' })
        await call('POST', `/api/spaces/${SPACE}/machines/hello`, { peerId: 'b' })
        const sent = await call('POST', `/api/spaces/${SPACE}/signal`, { from: 'a', to: 'b', payload: { type: 'offer' } })
        expect(sent).toEqual({ status: 200, body: { ok: true, delivered: 'local' } })
        const got = await call('GET', `/api/spaces/${SPACE}/signal?peer=b&wait=0`)
        expect(got.body.messages).toMatchObject([{ from: 'a', to: 'b', payload: { type: 'offer' } }])
        expect(typeof got.body.messages[0].at).toBe('number')
    })

    it('forwards to the host with the link, and queues for a follower', async () => {
        const { hub, call, forwarded } = await boot()
        const link = { base: 'http://host/serverXR', spaceId: 'room-there', token: 'dii_sync_k' }
        hub.setLink(SPACE, link)
        hub.recordRemotePeers(SPACE, viaLink(link.base), [{ peerId: 'on-host', machineId: 'h', machineName: 'asuz' }])
        const synced = await call('POST', `/api/spaces/${SPACE}/machines/sync`, {
            machine: { id: 'f1', name: 'asuz-follower' },
            peers: [{ peerId: 'on-follower', machineId: 'lies', machineName: 'lies' }]
        })
        expect(synced.status).toBe(200)
        expect(synced.body.peers.map(peer => peer.peerId)).toEqual(['on-host'])

        const up = await call('POST', `/api/spaces/${SPACE}/signal`, { from: 'x', to: 'on-host', payload: 1 })
        expect(up.body).toEqual({ ok: true, delivered: 'forwarded' })
        expect(forwarded).toEqual([{ link, body: { from: 'x', to: 'on-host', payload: 1, hops: 1 } }])

        const down = await call('POST', `/api/spaces/${SPACE}/signal`, { from: 'x', to: 'on-follower', payload: 2 })
        expect(down.body).toEqual({ ok: true, delivered: 'queued' })
        const mail = await call('GET', `/api/spaces/${SPACE}/signal?server=f1&wait=0`)
        expect(mail.body.messages.map(message => message.payload)).toEqual([2])
        const peers = (await call('GET', `/api/spaces/${SPACE}/machines`)).body.peers
        expect(peers.find(peer => peer.peerId === 'on-follower')).toMatchObject({ machineId: 'f1', machineName: 'asuz-follower' })
    })

    it('says 404 for nobody, 413 for too much, 502 when the host is gone', async () => {
        const { hub, call } = await boot({ forward: async () => ({ status: 0, payload: null }) })
        await call('POST', `/api/spaces/${SPACE}/machines/hello`, { peerId: 'a' })
        expect((await call('POST', `/api/spaces/${SPACE}/signal`, { from: 'a', to: 'nobody', payload: 1 })).status).toBe(404)
        expect((await call('POST', `/api/spaces/${SPACE}/signal`, { from: 'a', to: 'a', payload: 'x'.repeat(70_000) })).status).toBe(413)
        expect((await call('GET', `/api/spaces/${SPACE}/signal?peer=nobody`)).status).toBe(404)
        hub.setLink(SPACE, { base: 'http://host', spaceId: SPACE, token: null })
        hub.recordRemotePeers(SPACE, viaLink('http://host'), [{ peerId: 'on-host', machineId: 'h', machineName: 'asuz' }])
        expect((await call('POST', `/api/spaces/${SPACE}/signal`, { from: 'a', to: 'on-host', payload: 1 })).status).toBe(502)
        expect((await call('POST', `/api/spaces/${SPACE}/signal`, { from: 'a', to: 'on-host', payload: 1, hops: 3 })).status).toBe(508)
        expect((await call('GET', `/api/spaces/missing/machines`)).status).toBe(404)
    })

    it('holds a read open until a message lands', async () => {
        const { call } = await boot()
        await call('POST', `/api/spaces/${SPACE}/machines/hello`, { peerId: 'b' })
        const startedAt = Date.now()
        const held = call('GET', `/api/spaces/${SPACE}/signal?peer=b&wait=10`)
        await new Promise(resolve => setTimeout(resolve, 150))
        await call('POST', `/api/spaces/${SPACE}/signal`, { from: 'a', to: 'b', payload: 'answer' })
        const got = await held
        expect(got.body.messages.map(message => message.payload)).toEqual(['answer'])
        expect(Date.now() - startedAt).toBeLessThan(5000)
    })

    it('is editor-only on the space when auth is on — reads included', async () => {
        const viewer = await boot({ auth: { authenticated: true, role: 'viewer' } })
        expect((await viewer.call('GET', `/api/spaces/${SPACE}/machines`)).status).toBe(403)
        const nobody = await boot({ auth: { authenticated: false } })
        expect((await nobody.call('GET', `/api/spaces/${SPACE}/signal?peer=x`)).status).toBe(401)
        const elsewhere = await boot({ auth: { authenticated: true, role: 'editor', spaces: ['other'] } })
        expect((await elsewhere.call('POST', `/api/spaces/${SPACE}/machines/hello`, { peerId: 'a' })).status).toBe(403)
        const syncKey = await boot({ auth: { authenticated: true, role: 'editor', spaces: [SPACE] } })
        expect((await syncKey.call('POST', `/api/spaces/${SPACE}/machines/hello`, { peerId: 'a' })).status).toBe(200)
    })
})

describe('machine identity', () => {
    const envName = process.env.DI_MACHINE_NAME
    afterEach(() => {
        if (envName === undefined) delete process.env.DI_MACHINE_NAME
        else process.env.DI_MACHINE_NAME = envName
        forgetMachines()
    })

    it('mints an id once, keeps it in machine.json at 0600, and names itself', async () => {
        const dir = await mkdtemp(path.join(os.tmpdir(), 'dii-machine-'))
        cleanups.push(() => rm(dir, { recursive: true, force: true }))
        delete process.env.DI_MACHINE_NAME
        const first = getMachine(dir)
        expect(first.id).toMatch(/^[0-9a-f-]{36}$/)
        expect(first.name).toBe(os.hostname())
        const stored = JSON.parse(await readFile(path.join(dir, 'machine.json'), 'utf8'))
        expect(stored).toEqual({ format: 'di.machine', version: 1, id: first.id })
        expect((await stat(path.join(dir, 'machine.json'))).mode & 0o777).toBe(0o600)

        forgetMachines()
        await writeFile(path.join(dir, 'machine.json'), JSON.stringify({ ...stored, name: 'asuz' }))
        expect(getMachine(dir)).toEqual({ id: first.id, name: 'asuz' })
        process.env.DI_MACHINE_NAME = 'stage-left'
        expect(getMachine(dir)).toEqual({ id: first.id, name: 'stage-left' })
    })

    it('regenerates from a corrupt file instead of throwing', async () => {
        const dir = await mkdtemp(path.join(os.tmpdir(), 'dii-machine-'))
        cleanups.push(() => rm(dir, { recursive: true, force: true }))
        await writeFile(path.join(dir, 'machine.json'), '{nope')
        const machine = getMachine(dir)
        expect(machine.id).toMatch(/^[0-9a-f-]{36}$/)
        expect(JSON.parse(await readFile(path.join(dir, 'machine.json'), 'utf8')).id).toBe(machine.id)
        expect(getMachine(path.join(dir, 'machine.json', 'not-a-dir')).id).toMatch(/^[0-9a-f-]{36}$/)
    })
})
