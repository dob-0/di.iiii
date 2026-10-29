// @vitest-environment node
//
// `di follow <space> --from <label>` (docs/ai/team-sync-by-network-name.md §8):
// a bare label is a network name, found by beacon, DNS or its last address, and
// kept for Host, SNI and the certificate check. No real network: a fake resolver,
// and one loopback https server with a self-signed test certificate.
import https from 'node:https'
import tls from 'node:tls'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

import { parseArgs } from './args.mjs'
import { addFollow, readFollows } from './follows.mjs'
import { findByName, followSpace } from './follow.mjs'
import * as twin from './nameResolve.mjs'
import { ui } from './ui.mjs'

const require = createRequire(import.meta.url)
const server = require('../../serverXR/src/follow/nameResolver.js')
const serverBeacon = require('../../serverXR/src/follow/beacon.js')
const store = require('../../serverXR/src/follow/followStore.js')
const { joinSpace } = require('../../serverXR/src/follow/join.js')

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cli.mjs')
const NAME = 'ponyo-k7q2.l.test'

const homes = []
const servers = []
afterEach(async () => {
    tls.setDefaultCACertificates(tls.rootCertificates)
    while (servers.length) await new Promise((resolve) => servers.pop().close(resolve))
    while (homes.length) fs.rmSync(homes.pop(), { recursive: true, force: true })
})
const tmp = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'di-byname-')); homes.push(dir); return dir }
const installedHome = () => {
    const home = tmp()
    fs.mkdirSync(path.join(home, 'versions', '7.7.7-test'), { recursive: true })
    fs.symlinkSync(path.join(home, 'versions', '7.7.7-test'), path.join(home, 'current'))
    fs.writeFileSync(path.join(home, 'state.json'), JSON.stringify({ mode: 'node', version: '7.7.7-test' }))
    return home
}

describe('the two resolvers are one behaviour', () => {
    const cases = [
        { label: 'a-b1', listen: async () => ({ address: '10.0.0.2', port: 8443 }), lookup: async () => '10.0.0.3', last: { address: '10.0.0.4' } },
        { label: 'a-b1', listen: async () => null, lookup: async () => '10.0.0.3', last: { address: '10.0.0.4' } },
        { label: 'a-b1', listen: async () => null, lookup: async () => '127.0.0.1', last: { address: '10.0.0.4', port: 9000 } },
        { label: 'a-b1', listen: async () => null, lookup: async () => null, last: null },
        { label: 'a-b1', zone: 'x.test', listen: async () => ({ address: 'nope', port: 1 }), lookup: async () => null, last: null, probe: async () => false }
    ]
    it('same answer from the server file and the CLI twin, for every case', async () => {
        for (const one of cases) {
            const fromServer = await server.resolveName(one)
            const fromTwin = await twin.resolveName({ ...one, listen: one.listen })
            expect(fromTwin).toEqual(fromServer)
        }
    })
    it('same names, same packet, same label rule', () => {
        expect(twin.baseOf('a-b1', 'z.test', 8443)).toBe(server.baseOf('a-b1', 'z.test', 8443))
        expect(twin.zoneFrom({ env: {} })).toBe(server.zoneFrom({ env: {} }))
        expect(twin.encode({ label: 'a-b1', port: 7 })).toEqual(serverBeacon.encode({ label: 'a-b1', port: 7 }))
        expect(twin.BEACON_PORT).toBe(serverBeacon.BEACON_PORT)
        expect(serverBeacon.BEACON_PORT).toBe(41767)
        for (const v of ['a-b1', 'a.b', 'https://x', 'x']) expect(twin.isLabelInput(v), v).toBe(server.isLabelInput(v))
    })
})

describe('parsing: a label, a URL and --at are three different things', () => {
    it('--from takes the label as its value, like a URL', () => {
        expect(parseArgs(['follow', 'show', '--from', 'ponyo-k7q2', '--key', 'dii_sync_x']).flags).toEqual({ from: 'ponyo-k7q2', key: 'dii_sync_x' })
    })
    it('only a bare label is a network name; a URL, an address and a dotted host are not', () => {
        for (const label of ['ponyo-k7q2', 'dob-a3f9']) expect(twin.isLabelInput(label)).toBe(true)
        for (const url of ['https://ponyo-k7q2.l.diiii.xyz', 'http://127.0.0.1:4000', 'local.thedi.studio', '100.87.4.12']) expect(twin.isLabelInput(url)).toBe(false)
    })
    it('--from <label> --at <ip> keeps both on the line', () => {
        expect(parseArgs(['follow', 'show', '--from', 'ponyo-k7q2', '--at', '192.168.1.20']).flags).toEqual({ from: 'ponyo-k7q2', at: '192.168.1.20' })
    })
})

describe('findByName', () => {
    const home = () => installedHome()
    it('uses the zone from DI_NAME_ZONE, else this install\'s own name file, else the default', async () => {
        const seen = []
        const resolve = async (call) => { seen.push(call.zone); return { ok: true, address: '10.0.0.2', port: 443, route: 'dns', base: twin.baseOf(call.label, call.zone) } }
        const h = home()
        await findByName({ home: h, label: 'a-b1', env: {}, resolve })
        fs.mkdirSync(path.join(h, 'name'))
        fs.writeFileSync(path.join(h, 'name', 'name.json'), JSON.stringify({ label: 'me-0000', zone: 'team.example', name: 'me-0000.team.example' }))
        await findByName({ home: h, label: 'a-b1', env: {}, resolve })
        await findByName({ home: h, label: 'a-b1', env: { DI_NAME_ZONE: 'env.example' }, resolve })
        expect(seen).toEqual(['l.diiii.xyz', 'team.example', 'env.example'])
    })
    it('hands the stored last address to the resolver — only for the same label', async () => {
        const stored = { name: { label: 'a-b1', zone: 'l.diiii.xyz', lastAddress: '10.9.9.9', lastPort: 8443 } }
        const lasts = []
        const resolve = async (call) => { lasts.push(call.last); return { ok: false, tried: [] } }
        await findByName({ home: home(), label: 'a-b1', stored, resolve })
        await findByName({ home: home(), label: 'other-1', stored, resolve })
        expect(lasts).toEqual([{ address: '10.9.9.9', port: 8443 }, null])
    })
    it('not found names the label, the zone and what was tried', async () => {
        const found = await findByName({ home: home(), label: 'a-b1', env: { DI_NAME_ZONE: 'x.test' }, resolve: async () => ({ ok: false, tried: ['dns'] }) })
        expect(found).toEqual({ ok: false, reason: 'name-not-found', label: 'a-b1', zone: 'x.test', tried: ['dns'] })
    })
})

describe('the words', () => {
    it('name-not-found says what was looked at and what to do on their machine', () => {
        const words = ui.nameNotFound('a-b1', 'l.diiii.xyz', ['beacon'])
        expect(words).toContain('could not find a-b1')
        expect(words).toContain('tried: beacon')
        expect(words).toContain('di share')
    })
    it('di follows shows the name and which route found it, the way it shows the host', () => {
        const follows = { show: { remote: 'https://a-b1.l.diiii.xyz/serverXR', name: { label: 'a-b1', zone: 'l.diiii.xyz', route: 'beacon', lastAddress: '192.168.1.20' } }, jam: { remote: 'https://x.example/serverXR' } }
        const text = ui.followList(follows, [])
        expect(text).toContain('a-b1')
        expect(text).toContain('the beacon on this wifi')
        expect(text).toContain('192.168.1.20')
        expect(text).toContain('https://x.example')
    })
    it('following says which route found it', () => {
        const text = ui.following('show', 'https://a-b1.l.diiii.xyz/serverXR', false, '10.0.0.2', { label: 'a-b1', zone: 'l.diiii.xyz', route: 'dns', lastAddress: '10.0.0.2' })
        expect(text).toContain('by DNS')
        expect(text).toContain('a-b1.l.diiii.xyz')
    })
})

describe('the follow record keeps the name, in the CLI writer and the server reader', () => {
    const name = { label: 'a-b1', zone: 'l.diiii.xyz', route: 'beacon', lastAddress: '10.0.0.2', lastPort: 443 }
    it('written by the CLI, read by the server, with no pin when it is a name', async () => {
        const dir = tmp()
        await addFollow(dir, 'show', { remote: 'https://a-b1.l.diiii.xyz/serverXR', token: 't', name })
        expect(store.readFollows(dir).show.name).toEqual(name)
        expect(store.readFollows(dir).show.address).toBeUndefined()
    })
    it('a follow typed as a URL has no name key at all', async () => {
        const dir = tmp()
        await addFollow(dir, 'jam', { remote: 'https://x/serverXR', token: 't' })
        expect('name' in readFollows(dir).jam).toBe(false)
    })
    it('the server remembers the route that worked, without touching remote, key or pin', async () => {
        const dir = tmp()
        await addFollow(dir, 'show', { remote: 'https://a-b1.l.diiii.xyz/serverXR', token: 't', name })
        expect(await store.noteRoute(dir, 'show', { route: 'dns', address: '10.0.0.7', port: 8443 })).toBe(true)
        const entry = store.readFollows(dir).show
        expect(entry.name).toMatchObject({ route: 'dns', lastAddress: '10.0.0.7', lastPort: 8443 })
        expect(entry).toMatchObject({ remote: 'https://a-b1.l.diiii.xyz/serverXR', token: 't' })
        expect(await store.noteRoute(dir, 'show', { route: 'dns', address: '10.0.0.7', port: 8443 })).toBe(false)
    })
    it('a follow with no name is left alone by noteRoute', async () => {
        const dir = tmp()
        await addFollow(dir, 'jam', { remote: 'https://x/serverXR', token: 't' })
        expect(await store.noteRoute(dir, 'jam', { route: 'dns', address: '10.0.0.7', port: 443 })).toBe(false)
    })
})

describe('followSpace --from <label>', () => {
    it('a label no route finds is refused as name-not-found, and nothing is written', async () => {
        const home = installedHome()
        const result = await followSpace({ home, spaceId: 'show', from: 'a-b1', key: 'dii_sync_x.y', port: 1, find: async () => ({ ok: false, reason: 'name-not-found', label: 'a-b1', zone: 'z', tried: [] }) })
        expect(result).toMatchObject({ ok: false, reason: 'name-not-found', label: 'a-b1' })
        expect(fs.existsSync(path.join(home, 'data', 'follows.json'))).toBe(false)
    })
    it('the CLI says it in words, with exit code 1', () => {
        const home = installedHome()
        const run = spawnSync(process.execPath, [CLI, 'follow', 'show', '--from', 'nobody-0000', '--key', 'dii_sync_x.y'], {
            encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, DI_HOME: home, DI_NO_COLOR: '1', DI_NAME_ZONE: 'nowhere.invalid' }
        })
        expect(run.status).toBe(1)
        expect(run.stderr).toContain('could not find nobody-0000')
    }, 30000)

    it('finds it, pins the address, checks the certificate for the name, and stores the name — never the address', async () => {
        const dir = tmp()
        const made = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(dir, 'k.pem'), '-out', path.join(dir, 'c.pem'),
            '-days', '1', '-subj', `/CN=${NAME}`, '-addext', `subjectAltName=DNS:${NAME}`], { encoding: 'utf8' })
        expect(made.status, made.stderr).toBe(0)
        const pair = { key: fs.readFileSync(path.join(dir, 'k.pem')), cert: fs.readFileSync(path.join(dir, 'c.pem')) }
        tls.setDefaultCACertificates([...tls.rootCertificates, pair.cert.toString()])
        const hosts = []
        const door = https.createServer(pair, (req, res) => {
            hosts.push(req.headers.host)
            res.setHeader('Content-Type', 'application/json')
            if (req.url.endsWith('/api/health')) res.end('{"ok":true,"startedAt":"t","port":1}')
            else res.end('{"ops":[],"latestVersion":0}')
        })
        door.on('tlsClientError', () => {})
        const port = await new Promise((resolve) => door.listen(0, '127.0.0.1', () => { servers.push(door); resolve(door.address().port) }))

        const home = installedHome()
        const result = await followSpace({
            home, spaceId: 'show', from: 'ponyo-k7q2', key: 'dii_sync_x.y', port: 1, env: { DI_NAME_ZONE: 'l.test' },
            // The fake beacon answers; the real probe (resolveBase) then runs against the pinned loopback door.
            find: (ask) => findByName({ ...ask, resolve: (call) => twin.resolveName({ ...call, listen: async () => ({ address: '127.0.0.1', port }), lookup: async () => null }) })
        })
        expect(result).toMatchObject({ ok: true, address: '127.0.0.1', name: { label: 'ponyo-k7q2', zone: 'l.test', route: 'beacon', lastAddress: '127.0.0.1', lastPort: port } })
        expect(hosts.length).toBeGreaterThan(0)
        expect(hosts.every((host) => host === `${NAME}:${port}`)).toBe(true)
        const entry = readFollows(path.join(home, 'data')).show
        expect(entry.remote).toBe(`https://${NAME}:${port}/serverXR`)
        expect(entry.address).toBeUndefined()
        expect(entry.name.lastAddress).toBe('127.0.0.1')
    })
})

describe('join by words accepts a label where it accepts an address', () => {
    it('resolves it with the same resolver, pins every call, and writes the name', async () => {
        const calls = []
        const send = async (url, options) => {
            calls.push({ url, address: options.address, host: new URL(url).hostname })
            if (url.endsWith('/api/health')) return { ok: true, status: 200, json: () => ({ ok: true }) }
            if (url.endsWith('/peek')) return { ok: true, status: 200, json: () => ({ spaceId: 'show', label: 'Show', projects: 1, machine: { id: 'host-1', name: 'ponyo' } }) }
            if (url.endsWith('/redeem')) return { ok: true, status: 200, json: () => ({ token: 'dii_sync_a.b', spaceId: 'show' }) }
            return { ok: true, status: 200, json: () => ({ ops: [] }) }
        }
        const written = []
        const result = await joinSpace({
            address: 'ponyo-k7q2', code: 'one two three four', dataDir: '/x', machine: () => ({ id: 'me', name: 'me' }),
            readFollows: () => ({}), addFollow: async (...args) => written.push(args), spaceExistsHere: async () => false, ensureSpace: async () => {}, send,
            resolve: async ({ label, zone, probe }) => {
                expect(await probe({ address: '192.168.1.20', port: 443, route: 'beacon', name: `${label}.${zone}` })).toBe(true)
                return { ok: true, address: '192.168.1.20', port: 443, route: 'beacon', base: server.baseOf(label, zone) }
            }
        })
        expect(result).toMatchObject({ ok: true, spaceId: 'show', base: 'https://ponyo-k7q2.l.diiii.xyz/serverXR' })
        expect(calls.length).toBeGreaterThanOrEqual(4)
        expect(calls.every((call) => call.address === '192.168.1.20' && call.host === 'ponyo-k7q2.l.diiii.xyz')).toBe(true)
        expect(written[0][2]).toMatchObject({ remote: 'https://ponyo-k7q2.l.diiii.xyz/serverXR', name: { label: 'ponyo-k7q2', route: 'beacon' } })
    })
    it('a label nothing finds is "unreachable", never a crash', async () => {
        const result = await joinSpace({
            address: 'nobody-0000', code: 'one two three four', dataDir: '/x', machine: () => ({ id: 'me', name: 'me' }),
            readFollows: () => ({}), addFollow: async () => {}, spaceExistsHere: async () => false, ensureSpace: async () => {}, send: async () => ({ ok: false, status: 0, json: () => null }),
            resolve: async () => ({ ok: false, tried: [] })
        })
        expect(result).toEqual({ ok: false, reason: 'unreachable' })
    })
})
