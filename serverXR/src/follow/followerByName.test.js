// @vitest-environment node
//
// A follow found by NAME heals itself: when the host stops answering, the
// follower asks the resolver again and the next tick goes to where it is now
// (nameResolve.js reresolver, called from follower.js). And the join flow takes
// a label wherever it takes an address, through the same resolver.
import http from 'node:http'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { side, startFollowing } = require('./follower.js')
const { findHost, inspectJoin, joinSpace } = require('./join.js')

const cleanups = []
afterEach(async () => { while (cleanups.length) await cleanups.pop()() })

const quietSpace = async () => {
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        const url = req.url || ''
        if (url.includes('/projects')) res.end(JSON.stringify({ projects: [] }))
        else if (url.includes('/ops')) res.end(JSON.stringify({ ops: [], latestVersion: 1 }))
        else res.end(JSON.stringify({ scene: { objects: [] }, version: 1 }))
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${server.address().port}/serverXR`
    cleanups.push(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve) }))
    return { base }
}

const until = async (check, ms = 8000) => {
    const end = Date.now() + ms
    while (Date.now() < end) {
        const value = check()
        if (value) return value
        await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error('timed out waiting')
}

describe('the running follower re-resolves when its host stops answering', () => {
    it('asks the resolver, moves to the new place, and then reaches the host', async () => {
        const local = await quietSpace()
        const live = await quietSpace()
        const remote = side({ base: 'http://127.0.0.1:1/serverXR', spaceId: 's' }) // nothing there
        const reresolve = vi.fn(async () => { remote.base = live.base; return { ok: true } })
        remote.reresolve = reresolve
        const follower = startFollowing({ local: side({ base: local.base, spaceId: 's' }), remote, log: { info() {}, warn() {} } })
        cleanups.push(() => follower.stop())
        await until(() => (follower.state.lastAnswerAt ? follower.state : null))
        expect(reresolve).toHaveBeenCalled()
        expect(follower.state.hostAnswering).toBe(true)
    })

    it('a follow with no resolver (typed as a URL) is untouched by any of this', async () => {
        const local = await quietSpace()
        const remote = side({ base: 'http://127.0.0.1:1/serverXR', spaceId: 's' })
        expect(remote.reresolve).toBeUndefined()
        const follower = startFollowing({ local: side({ base: local.base, spaceId: 's' }), remote, log: { info() {}, warn() {} } })
        cleanups.push(() => follower.stop())
        await new Promise((resolve) => setTimeout(resolve, 300))
        expect(follower.state.hostAnswering).toBe(false)
    })
})

describe('join by words takes a label where it takes an address', () => {
    const NAME = 'ponyo-k7q2.test-zone.example'
    const answer = (status, payload) => ({ ok: status >= 200 && status < 300, status, json: () => payload })
    const fakeHost = () => {
        const calls = []
        const send = async (url, options = {}) => {
            calls.push({ url, address: options.address || null })
            if (!url.startsWith(`https://${NAME}`)) throw new Error('ECONNREFUSED')
            if (url.endsWith('/api/health')) return answer(200, { ok: true })
            if (url.endsWith('/api/join-codes/peek')) return answer(200, { ok: true, spaceId: 'moxir', label: 'MOXIR', projects: 3, machine: { id: 'host', name: 'ponyo' } })
            if (url.endsWith('/api/join-codes/redeem')) return answer(201, { ok: true, spaceId: 'moxir', token: 'dii_sync_abc.def' })
            if (url.includes('/ops?since=0')) return answer(200, { latestVersion: 1 })
            return answer(404, null)
        }
        return { send, calls }
    }
    const found = async () => ({ ok: true, route: 'beacon', address: '192.168.15.53', port: 8443, name: NAME })
    const deps = (extra = {}) => {
        const written = []
        return { written, deps: { dataDir: '/d', machine: () => ({ id: 'me', name: 'aylmo' }), readFollows: () => ({}), addFollow: async (dir, id, entry) => { written.push({ id, entry }) }, spaceExistsHere: async () => false, ensureSpace: async () => {}, zone: 'test-zone.example', resolveNamed: found, ...extra } }
    }

    it('findHost resolves the label, asks at the found address and keeps the name', async () => {
        const host = fakeHost()
        const result = await findHost('ponyo-k7q2', { send: host.send, resolveNamed: found, zone: 'test-zone.example' })
        expect(result).toMatchObject({ base: `https://${NAME}:8443/serverXR`, pin: '192.168.15.53', via: 'beacon', name: { label: 'ponyo-k7q2', zone: 'test-zone.example' } })
        expect(host.calls[0]).toEqual({ url: `https://${NAME}:8443/serverXR/api/health`, address: '192.168.15.53' })
    })

    it('a label nobody can find is "not-found", and a typed address still goes the old way', async () => {
        const missing = async () => ({ ok: false, tried: ['beacon', 'dns', 'last'] })
        expect(await findHost('ponyo-k7q2', { send: fakeHost().send, resolveNamed: missing })).toEqual({ base: null, reason: 'not-found' })
        expect(await findHost('', { send: fakeHost().send })).toEqual({ base: null, reason: 'bad-address' })
    })

    it('inspect and join send every call to the found address, and the follow is written as a named one', async () => {
        const host = fakeHost()
        const { deps: d, written } = deps()
        const peeked = await inspectJoin({ address: 'ponyo-k7q2', code: 'amber-tiger-moon-seven', send: host.send, ...d })
        expect(peeked).toMatchObject({ ok: true, spaceId: 'moxir', pin: '192.168.15.53', via: 'beacon' })
        const joined = await joinSpace({ address: 'ponyo-k7q2', code: 'amber-tiger-moon-seven', send: host.send, ...d })
        expect(joined.ok).toBe(true)
        expect(host.calls.every((call) => call.address === '192.168.15.53')).toBe(true)
        expect(written[0].entry).toMatchObject({ remote: `https://${NAME}:8443/serverXR`, token: 'dii_sync_abc.def', name: { label: 'ponyo-k7q2', zone: 'test-zone.example' }, via: 'beacon', lastAddress: '192.168.15.53' })
    })
})
