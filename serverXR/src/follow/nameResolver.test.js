// @vitest-environment node
//
// Follow by name (docs/ai/team-sync-by-network-name.md §8): the resolver's order,
// the beacon's packet, the certificate check under the name, and the running
// follower asking again when the install moved. No real network: fake beacon,
// fake DNS, a loopback https server with a self-signed test certificate.
import https from 'node:https'
import tls from 'node:tls'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { announce, decode, encode, listen, isLabel } from './beacon'
import { baseOf, createReresolver, isLabelInput, nameOf, resolveName, zoneFrom, DEFAULT_ZONE } from './nameResolver'
import { httpRequest } from '../httpClient'

const never = async () => null
const heard = (address, port = 443) => async () => ({ address, port })
const dnsAt = (address) => async () => address

describe('what counts as a network name', () => {
    it('a bare label: letters, digits and a dash, no dot, no scheme, no port', () => {
        for (const ok of ['ponyo-k7q2', 'dob-a3f9', 'a1']) expect(isLabelInput(ok), ok).toBe(true)
        for (const bad of ['https://x', 'local.thedi.studio', '192.168.1.5', 'host:4000', '', 'Ponyo K', '-x', 'x-']) expect(isLabelInput(bad), bad).toBe(false)
    })
    it('the zone is a config value: env, then the own name file, then l.di-studio.xyz', () => {
        expect(DEFAULT_ZONE).toBe('l.di-studio.xyz')
        expect(zoneFrom({ env: {} })).toBe('l.di-studio.xyz')
        expect(zoneFrom({ env: {}, own: { zone: 'Team.Example' } })).toBe('team.example')
        expect(zoneFrom({ env: { DI_NAME_ZONE: 'x.test' }, own: { zone: 'team.example' } })).toBe('x.test')
    })
    it('the name and the base keep the label, and the port only when it is not 443', () => {
        expect(nameOf('ponyo-k7q2')).toBe('ponyo-k7q2.l.di-studio.xyz')
        expect(baseOf('ponyo-k7q2', 'l.di-studio.xyz')).toBe('https://ponyo-k7q2.l.di-studio.xyz')
        expect(baseOf('ponyo-k7q2', 'l.di-studio.xyz', 8443)).toBe('https://ponyo-k7q2.l.di-studio.xyz:8443')
    })
})

describe('resolveName — beacon, then DNS, then the last address', () => {
    const base = { label: 'ponyo-k7q2', zone: 'l.di-studio.xyz' }

    it('the beacon wins when it is heard, with its port', async () => {
        const found = await resolveName({ ...base, listen: heard('192.168.1.20', 8443), lookup: dnsAt('10.0.0.9'), last: { address: '10.1.1.1' } })
        expect(found).toMatchObject({ ok: true, route: 'beacon', address: '192.168.1.20', port: 8443, base: 'https://ponyo-k7q2.l.di-studio.xyz:8443' })
    })
    it('DNS next, when nothing was heard', async () => {
        const found = await resolveName({ ...base, listen: never, lookup: dnsAt('10.0.0.9'), last: { address: '10.1.1.1' } })
        expect(found).toMatchObject({ ok: true, route: 'dns', address: '10.0.0.9' })
    })
    it('the last address that worked, when neither answers', async () => {
        const found = await resolveName({ ...base, listen: never, lookup: never, last: { address: '10.1.1.1', port: 8443 } })
        expect(found).toMatchObject({ ok: true, route: 'last', address: '10.1.1.1', port: 8443 })
    })
    it('a loopback DNS answer is the broker\'s "not shared" marker — no route, skipped', async () => {
        const found = await resolveName({ ...base, listen: never, lookup: dnsAt('127.0.0.1'), last: { address: '10.1.1.1' } })
        expect(found.route).toBe('last')
    })
    it('nothing found says which routes were tried, and is not ok', async () => {
        const found = await resolveName({ ...base, listen: never, lookup: dnsAt('127.0.0.1'), last: null })
        expect(found).toEqual({ ok: false, tried: [] })
    })
    it('a route whose probe fails is not believed: the next one is tried', async () => {
        const probe = vi.fn(async ({ route }) => route === 'last')
        const found = await resolveName({ ...base, listen: heard('192.168.1.99'), lookup: dnsAt('10.0.0.9'), last: { address: '10.1.1.1' }, probe })
        expect(found).toMatchObject({ ok: true, route: 'last', address: '10.1.1.1' })
        expect(probe.mock.calls.map(([c]) => c.route)).toEqual(['beacon', 'dns', 'last'])
        expect(probe.mock.calls.every(([c]) => c.name === 'ponyo-k7q2.l.di-studio.xyz')).toBe(true)
    })
    it('every probe failing is a refusal naming the routes that had an address', async () => {
        const found = await resolveName({ ...base, listen: heard('192.168.1.99'), lookup: dnsAt('10.0.0.9'), last: { address: '10.1.1.1' }, probe: async () => false })
        expect(found).toEqual({ ok: false, tried: ['beacon', 'dns', 'last'] })
    })
    it('skip leaves a route out (the beacon is not listened for when told not to)', async () => {
        const listenSpy = vi.fn(heard('192.168.1.20'))
        const found = await resolveName({ ...base, listen: listenSpy, lookup: dnsAt('10.0.0.9'), skip: ['beacon'] })
        expect(found.route).toBe('dns')
        expect(listenSpy).not.toHaveBeenCalled()
    })
    it('an answer that is not an address is ignored', async () => {
        const found = await resolveName({ ...base, listen: heard('not-an-ip'), lookup: dnsAt('also-not'), last: null })
        expect(found.ok).toBe(false)
    })
})

describe('the beacon packet', () => {
    it('round-trips { label, port } and nothing else', () => {
        expect(decode(encode({ label: 'ponyo-k7q2', port: 443 }))).toEqual({ label: 'ponyo-k7q2', port: 443 })
    })
    it('refuses a bad label or port, and ignores other traffic on the port', () => {
        expect(encode({ label: 'a.b', port: 443 })).toBe(null)
        expect(encode({ label: 'ponyo-k7q2', port: 0 })).toBe(null)
        expect(encode({ label: 'ponyo-k7q2', port: 99999 })).toBe(null)
        for (const junk of ['', 'hello', '{"kind":"other"}', '{"v":1,"kind":"di-name","label":"x.y","port":1}', '[1]']) expect(decode(Buffer.from(junk)), junk).toBe(null)
        expect(isLabel('ponyo-k7q2')).toBe(true)
    })
    it('announce and listen meet on loopback; another label is not heard', async () => {
        const beaconPort = 41931
        const wanted = listen({ label: 'ponyo-k7q2', timeoutMs: 1500, beaconPort })
        await new Promise((resolve) => setTimeout(resolve, 100))
        expect(await announce({ label: 'ponyo-k7q2', port: 8443, beaconPort, target: '127.0.0.1' })).toBe(true)
        expect(await wanted).toEqual({ address: '127.0.0.1', port: 8443 })
        // One listener at a time: loopback unicast reaches only one socket on a shared port.
        const other = listen({ label: 'kiara-zzzz', timeoutMs: 400, beaconPort })
        await new Promise((resolve) => setTimeout(resolve, 100))
        await announce({ label: 'ponyo-k7q2', port: 8443, beaconPort, target: '127.0.0.1' })
        expect(await other).toBe(null)
    })
    it('silence is null at the end of the wait, never a throw', async () => {
        expect(await listen({ label: 'ponyo-k7q2', timeoutMs: 80, beaconPort: 41932 })).toBe(null)
        expect(await listen({ label: 'not a label', timeoutMs: 10 })).toBe(null)
    })
})

describe('the pin keeps the name: Host, SNI and the certificate check', () => {
    const dirs = []
    const servers = []
    afterEach(async () => {
        tls.setDefaultCACertificates(tls.rootCertificates)
        while (servers.length) await new Promise((resolve) => servers.pop().close(resolve))
        while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true })
    })

    const certFor = (name) => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'di-name-cert-'))
        dirs.push(dir)
        const made = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(dir, 'k.pem'), '-out', path.join(dir, 'c.pem'),
            '-days', '1', '-subj', `/CN=${name}`, '-addext', `subjectAltName=DNS:${name}`], { encoding: 'utf8' })
        expect(made.status, made.stderr).toBe(0)
        return { key: fs.readFileSync(path.join(dir, 'k.pem')), cert: fs.readFileSync(path.join(dir, 'c.pem')) }
    }
    const serve = (pair, seen) => new Promise((resolve) => {
        const server = https.createServer(pair, (req, res) => { seen.host = req.headers.host; res.setHeader('Content-Type', 'application/json'); res.end('{"ok":true}') })
        server.on('tlsClientError', () => {})
        server.listen(0, '127.0.0.1', () => { servers.push(server); resolve(server.address().port) })
    })

    it('reaches the pinned address under the name, sending Host = the name, when the certificate is for that name', async () => {
        const name = 'ponyo-k7q2.l.test'
        const pair = certFor(name)
        tls.setDefaultCACertificates([...tls.rootCertificates, pair.cert.toString()])
        const seen = {}
        const port = await serve(pair, seen)
        const answer = await httpRequest(`https://${name}:${port}/serverXR/api/health`, { address: '127.0.0.1', timeoutMs: 4000 })
        expect(answer.ok).toBe(true)
        expect(seen.host).toBe(`${name}:${port}`)
    })
    it('refuses a machine that answers at the address with a certificate for another name', async () => {
        const wrong = certFor('somebody-else.l.test')
        tls.setDefaultCACertificates([...tls.rootCertificates, wrong.cert.toString()])
        const port = await serve(wrong, {})
        await expect(httpRequest(`https://ponyo-k7q2.l.test:${port}/serverXR/api/health`, { address: '127.0.0.1', timeoutMs: 4000 })).rejects.toThrow(/altnames|Hostname\/IP/i)
    })
    it('refuses a certificate nobody vouches for, even when the name matches', async () => {
        const name = 'ponyo-k7q2.l.test'
        const port = await serve(certFor(name), {})
        await expect(httpRequest(`https://${name}:${port}/serverXR/api/health`, { address: '127.0.0.1', timeoutMs: 4000 })).rejects.toThrow()
    })
})

describe('createReresolver — the running follower asks again when the install moved', () => {
    const remote = () => ({ base: 'https://ponyo-k7q2.l.di-studio.xyz/serverXR', address: '192.168.1.20' })
    const name = { label: 'ponyo-k7q2', zone: 'l.di-studio.xyz' }

    it('moves address and base in place, keeps /serverXR, remembers the route, and says it moved', async () => {
        const side = remote()
        const onRoute = vi.fn()
        const resolve = vi.fn(async () => ({ ok: true, address: '192.168.1.77', port: 8443, route: 'beacon', base: 'https://ponyo-k7q2.l.di-studio.xyz:8443' }))
        const again = createReresolver({ name, remote: side, resolve, probe: async () => true, onRoute })
        expect(await again()).toBe(true)
        expect(side).toEqual({ base: 'https://ponyo-k7q2.l.di-studio.xyz:8443/serverXR', address: '192.168.1.77' })
        expect(onRoute).toHaveBeenCalledWith({ route: 'beacon', address: '192.168.1.77', port: 8443 })
        expect(resolve.mock.calls[0][0].last).toEqual({ address: '192.168.1.20', port: 443 })
    })
    it('the same place is "did not move", so nothing is asked twice for nothing', async () => {
        const side = remote()
        const again = createReresolver({ name, remote: side, resolve: async () => ({ ok: true, address: '192.168.1.20', port: 443, route: 'last', base: 'https://ponyo-k7q2.l.di-studio.xyz' }) })
        expect(await again()).toBe(false)
    })
    it('a failed search leaves the remote alone and is not repeated inside the gap', async () => {
        let clock = 1000
        const side = remote()
        const resolve = vi.fn(async () => ({ ok: false, tried: [] }))
        const again = createReresolver({ name, remote: side, resolve, minGapMs: 5000, now: () => clock })
        expect(await again()).toBe(false)
        expect(await again()).toBe(false)
        expect(resolve).toHaveBeenCalledTimes(1)
        clock += 6000
        await again()
        expect(resolve).toHaveBeenCalledTimes(2)
        expect(side.address).toBe('192.168.1.20')
    })
    it('a store that cannot remember does not break the follow', async () => {
        const again = createReresolver({ name, remote: remote(), resolve: async () => ({ ok: true, address: '10.0.0.5', port: 443, route: 'dns', base: 'https://ponyo-k7q2.l.di-studio.xyz' }), onRoute: async () => { throw new Error('disk') } })
        expect(await again()).toBe(true)
    })
})

describe('the running follower, end to end on loopback', () => {
    it('a followed name that goes silent is looked for again, and the next read goes to the new place', async () => {
        const { createRequire } = await import('node:module')
        const http = await import('node:http')
        const { side, startFollowing } = createRequire(import.meta.url)('./follower.js')
        const quiet = () => new Promise((resolve) => {
            const server = http.createServer((req, res) => {
                res.writeHead(200, { 'Content-Type': 'application/json' })
                if ((req.url || '').includes('/projects')) res.end('{"projects":[]}')
                else if ((req.url || '').includes('/ops')) res.end('{"ops":[],"latestVersion":1}')
                else res.end('{"scene":{"objects":[]},"version":1}')
            })
            server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
        })
        const local = await quiet()
        const moved = await quiet()
        // The remote starts at a port nobody listens on: its install "moved" to `moved`.
        const remote = side({ base: 'http://127.0.0.1:1/serverXR', spaceId: 's' })
        let asked = 0
        remote.reresolve = async () => { asked += 1; remote.base = `http://127.0.0.1:${moved.port}/serverXR`; return true }
        const follower = startFollowing({ local: side({ base: `http://127.0.0.1:${local.port}/serverXR`, spaceId: 's' }), remote, log: { info() {}, warn() {} } })
        try {
            const end = Date.now() + 8000
            while (!follower.state.lastAnswerAt && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 50))
            expect(asked).toBeGreaterThanOrEqual(1)
            expect(follower.state.lastAnswerAt).toBeTruthy()
            expect(follower.state.hostAnswering).toBe(true)
        } finally {
            follower.stop()
            local.server.closeAllConnections?.(); moved.server.closeAllConnections?.()
            local.server.close(); moved.server.close()
        }
    })
})
