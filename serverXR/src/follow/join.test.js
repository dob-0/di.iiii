import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { candidateBases, findHost, inspectJoin, joinSpace } = require('./join.js')

const ME = { id: 'machine-me', name: 'aylmo' }
const HOST = { id: 'machine-host', name: 'ponyo' }

// A host that answers what the join asks it, and records every call.
const fakeHost = ({ peek = null, redeem = null, reachable = ['http://192.168.1.9:3000/serverXR'], opsOk = true } = {}) => {
    const calls = []
    const send = async (url, options = {}) => {
        calls.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null, headers: options.headers })
        const answer = (status, payload) => ({ ok: status >= 200 && status < 300, status, json: () => payload })
        const base = reachable.find((candidate) => url.startsWith(candidate))
        if (!base) throw new Error('ECONNREFUSED')
        if (url.endsWith('/api/health')) return answer(200, { ok: true })
        if (url.endsWith('/api/join-codes/peek')) return peek || answer(200, { ok: true, spaceId: 'moxir', label: 'MOXIR', projects: 16, machine: HOST })
        if (url.endsWith('/api/join-codes/redeem')) return redeem || answer(201, { ok: true, spaceId: 'moxir', token: 'dii_sync_abc.def' })
        if (url.includes('/ops?since=0')) return answer(opsOk ? 200 : 401, { latestVersion: 4 })
        return answer(404, null)
    }
    return { send, calls }
}

const baseDeps = (overrides = {}) => {
    const written = []
    const made = []
    return {
        deps: {
            dataDir: '/data',
            machine: () => ME,
            readFollows: () => ({}),
            addFollow: async (dir, spaceId, entry) => { written.push({ dir, spaceId, entry }) },
            spaceExistsHere: async () => false,
            ensureSpace: async (spaceId, label) => { made.push({ spaceId, label }) },
            ...overrides
        },
        written,
        made
    }
}

describe('where a typed address might mean', () => {
    it('tries a name as https first and a dotted address as http first, each with and without /serverXR', () => {
        expect(candidateBases('local.thedi.studio')).toEqual([
            'https://local.thedi.studio/serverXR', 'https://local.thedi.studio',
            'http://local.thedi.studio/serverXR', 'http://local.thedi.studio'
        ])
        expect(candidateBases('192.168.1.9:3000')[0]).toBe('http://192.168.1.9:3000/serverXR')
        expect(candidateBases('https://x.example/serverXR/')).toEqual(['https://x.example/serverXR'])
    })

    it('refuses what is not an address, another scheme, and credentials in the address', () => {
        expect(candidateBases('')).toEqual([])
        expect(candidateBases('two words')).toEqual([])
        expect(candidateBases('ftp://host')).toEqual([])
        expect(candidateBases('https://user:secret@host.example')).toEqual([])
    })

    it('finds the host through the first candidate that answers health', async () => {
        const { send } = fakeHost()
        const found = await findHost('192.168.1.9:3000', { send })
        expect(found.base).toBe('http://192.168.1.9:3000/serverXR')
        const none = await findHost('10.0.0.5:3000', { send })
        expect(none).toEqual({ base: null, reason: 'unreachable' })
        expect(await findHost('', { send })).toEqual({ base: null, reason: 'bad-address' })
    })
})

describe('inspecting a code before spending it', () => {
    it('says what is behind it without redeeming', async () => {
        const host = fakeHost()
        const { deps } = baseDeps()
        const seen = await inspectJoin({ address: '192.168.1.9:3000', code: 'a b c d', send: host.send, ...deps })
        expect(seen).toMatchObject({ ok: true, spaceId: 'moxir', label: 'MOXIR', projects: 16, hostName: 'ponyo', localExists: false })
        expect(host.calls.some((call) => call.url.endsWith('/redeem'))).toBe(false)
    })

    it('refuses to follow itself, and a space it already follows', async () => {
        const { deps } = baseDeps()
        const self = fakeHost({ peek: { ok: true, status: 200, json: () => ({ ok: true, spaceId: 'moxir', label: 'M', machine: ME }) } })
        expect((await inspectJoin({ address: '192.168.1.9:3000', code: 'x', send: self.send, ...deps })).reason).toBe('itself')

        const again = baseDeps({ readFollows: () => ({ moxir: { remote: 'http://elsewhere' } }) })
        expect((await inspectJoin({ address: '192.168.1.9:3000', code: 'x', send: fakeHost().send, ...again.deps })).reason).toBe('already')
    })

    it('tells a wrong code, a throttled client and an older host apart', async () => {
        const { deps } = baseDeps()
        const wrong = fakeHost({ peek: { ok: false, status: 404, json: () => ({ code: 'invalid-code' }) } })
        expect((await inspectJoin({ address: '192.168.1.9:3000', code: 'x', send: wrong.send, ...deps })).reason).toBe('invalid-code')
        const throttled = fakeHost({ peek: { ok: false, status: 429, json: () => ({ code: 'throttled', retryAfterSeconds: 120 }) } })
        expect(await inspectJoin({ address: '192.168.1.9:3000', code: 'x', send: throttled.send, ...deps })).toMatchObject({ reason: 'throttled', retryAfterSeconds: 120 })
        const old = fakeHost({ peek: { ok: false, status: 404, json: () => ({ error: 'Cannot POST' }) } })
        expect((await inspectJoin({ address: '192.168.1.9:3000', code: 'x', send: old.send, ...deps })).reason).toBe('host-too-old')
    })
})

describe('joining', () => {
    it('spends the code, makes the space here and writes the follow down with the key it got', async () => {
        const host = fakeHost()
        const { deps, written, made } = baseDeps()
        const result = await joinSpace({ address: '192.168.1.9:3000', code: 'amber desk nine river', send: host.send, ...deps })
        expect(result).toMatchObject({ ok: true, spaceId: 'moxir', hostName: 'ponyo' })
        expect(made).toEqual([{ spaceId: 'moxir', label: 'MOXIR' }])
        expect(written).toEqual([{ dir: '/data', spaceId: 'moxir', entry: { remote: 'http://192.168.1.9:3000/serverXR', token: 'dii_sync_abc.def', label: 'ponyo' } }])
        const redeem = host.calls.find((call) => call.url.endsWith('/redeem'))
        expect(redeem.body).toEqual({ code: 'amber desk nine river', machine: { id: ME.id, name: ME.name } })
    })

    it('does not spend the code on a merge it has not been told to make', async () => {
        const host = fakeHost()
        const { deps, written } = baseDeps({ spaceExistsHere: async () => true })
        const refused = await joinSpace({ address: '192.168.1.9:3000', code: 'x', send: host.send, ...deps })
        expect(refused).toMatchObject({ ok: false, reason: 'merge', spaceId: 'moxir' })
        expect(host.calls.some((call) => call.url.endsWith('/redeem'))).toBe(false)
        expect(written).toEqual([])

        const merged = await joinSpace({ address: '192.168.1.9:3000', code: 'x', into: true, send: fakeHost().send, ...deps })
        expect(merged).toMatchObject({ ok: true, merged: true })
        expect(written).toHaveLength(1)
    })

    it('writes nothing down when the key it received does not work, and says the code is spent', async () => {
        const host = fakeHost({ opsOk: false })
        const { deps, written, made } = baseDeps()
        const result = await joinSpace({ address: '192.168.1.9:3000', code: 'x', send: host.send, ...deps })
        expect(result.reason).toBe('spent-denied')
        expect(written).toEqual([])
        expect(made).toEqual([])
    })
})
