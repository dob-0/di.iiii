// @vitest-environment node
//
// `di follow <space> --from <label>`: a bare label is another install's network
// name. Found by beacon, DNS or the last address; the name stays for Host, SNI
// and the certificate check. The TLS cases run `followSpace` in a child node
// with NODE_EXTRA_CA_CERTS set to a throw-away certificate for a test name —
// the pin is exercised for real, on loopback, with no DNS entry for that name.
import { execFile, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import https from 'node:https'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { parseArgs } from './args.mjs'
import { followSpace } from './follow.mjs'
import { addFollow, readFollows } from './follows.mjs'
import { ui } from './ui.mjs'

const require = createRequire(import.meta.url)
const store = require('../../serverXR/src/follow/followStore.js')
const HERE = path.dirname(fileURLToPath(import.meta.url))
const run = promisify(execFile)

const NAME = 'ponyo-k7q2.test-zone.example'
let tmp
const servers = []
const homes = []
const strip = (text) => text.replace(new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g'), '')

const makeCert = (name) => {
    const key = path.join(tmp, `${name}.key`)
    const cert = path.join(tmp, `${name}.pem`)
    execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-keyout', key, '-out', cert, '-days', '1', '-nodes',
        '-subj', `/CN=${name}`, '-addext', `subjectAltName=DNS:${name}`], { stdio: 'ignore' })
    return { key: fs.readFileSync(key), cert: fs.readFileSync(cert), file: cert }
}

const startTls = async ({ key, cert }) => {
    const server = https.createServer({ key, cert }, (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        if (req.url.startsWith('/serverXR/api/health')) return res.end(JSON.stringify({ ok: true, startedAt: 1, port: 1 }))
        if (req.url.includes('/ops?since=0')) return res.end(JSON.stringify({ ops: [], latestVersion: 0 }))
        res.statusCode = 404
        return res.end('{}')
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    servers.push(server)
    return server.address().port
}

const tempHome = async () => {
    const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'di-follow-name-'))
    homes.push(home)
    return home
}

// Runs followSpace in a child that trusts `caFile`, with a resolver that answers `found`.
const followInChild = async ({ home, caFile, from = 'ponyo-k7q2', found, at = null }) => {
    const script = `
      import { followSpace } from ${JSON.stringify(path.join(HERE, 'follow.mjs'))}
      const found = JSON.parse(process.env.FOUND)
      const result = await followSpace({ home: process.env.HOME_DIR, spaceId: 'jam', from: process.env.FROM, key: 'dii_sync_x', port: 1,
        zone: 'test-zone.example', address: process.env.AT || null, resolveNamed: async () => found })
      console.log(JSON.stringify(result))`
    const { stdout } = await run(process.execPath, ['--input-type=module', '-e', script], {
        env: { ...process.env, NODE_EXTRA_CA_CERTS: caFile, HOME_DIR: home, FROM: from, FOUND: JSON.stringify(found), AT: at || '' }
    })
    return JSON.parse(stdout.trim().split('\n').pop())
}

beforeAll(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'di-follow-name-cert-')) })
afterAll(async () => {
    while (servers.length) await new Promise((resolve) => servers.pop().close(resolve))
    while (homes.length) await fsp.rm(homes.pop(), { recursive: true, force: true })
    fs.rmSync(tmp, { recursive: true, force: true })
})

describe('parsing: a label, a URL and --at are three different things', () => {
    it('--from <label> is a bare token; --from https://… is a URL', () => {
        expect(parseArgs(['follow', 'jam', '--from', 'ponyo-k7q2', '--key', 'k']).flags).toEqual({ from: 'ponyo-k7q2', key: 'k' })
        expect(parseArgs(['follow', 'jam', '--from', 'https://local.thedi.studio']).flags.from).toBe('https://local.thedi.studio')
        expect(parseArgs(['follow', 'jam', '--from', 'https://x', '--at', '100.87.4.12']).flags.at).toBe('100.87.4.12')
    })
})

describe('followSpace with a label: the resolver, and what is stored', () => {
    it('nothing found → not-found, says what was tried, and writes nothing', async () => {
        const home = await tempHome()
        const result = await followSpace({ home, spaceId: 'jam', from: 'ponyo-k7q2', key: 'k', port: 1, zone: 'test-zone.example',
            resolveNamed: async () => ({ ok: false, tried: ['beacon', 'dns', 'last'], name: NAME }) })
        expect(result).toMatchObject({ ok: false, reason: 'not-found', name: NAME, tried: ['beacon', 'dns', 'last'] })
        expect(readFollows(path.join(home, 'data'))).toEqual({})
    })

    it('hands the resolver the label and the zone, and the stored last address', async () => {
        const home = await tempHome()
        await addFollow(path.join(home, 'data'), 'jam', { remote: `https://${NAME}:8443/serverXR`, token: 'dii_sync_x', name: { label: 'ponyo-k7q2', zone: 'test-zone.example' }, via: 'beacon', lastAddress: '192.168.15.53' })
        const asked = []
        await followSpace({ home, spaceId: 'jam', from: 'ponyo-k7q2', key: null, port: 1, zone: 'test-zone.example',
            resolveNamed: async (query) => { asked.push(query); return { ok: false, tried: [], name: NAME } } })
        expect(asked).toEqual([{ label: 'ponyo-k7q2', zone: 'test-zone.example', last: '192.168.15.53' }])
    })

    it('a found address that is not a di.iiii is refused as unreachable, not stored', async () => {
        const home = await tempHome()
        const result = await followSpace({ home, spaceId: 'jam', from: 'ponyo-k7q2', key: 'k', port: 1, zone: 'test-zone.example',
            resolveNamed: async () => ({ ok: true, route: 'beacon', address: '127.0.0.1', port: 9, name: NAME }) })
        expect(result).toMatchObject({ ok: false, reason: 'unreachable' })
        expect(readFollows(path.join(home, 'data'))).toEqual({})
    })

    it('a typed --at wins: no resolution, an ordinary pinned follow', async () => {
        const home = await tempHome()
        let asked = false
        const result = await followSpace({ home, spaceId: 'jam', from: 'ponyo-k7q2', key: 'k', port: 1, address: '127.0.0.1', zone: 'test-zone.example',
            resolveNamed: async () => { asked = true; return { ok: false, tried: [] } } })
        expect(asked).toBe(false)
        expect(result.ok).toBe(false) // 'ponyo-k7q2' is not a URL; nothing was stored
    })
})

describe('the pin, for real: the name is checked, the address is where the socket goes', () => {
    it('connects to the found address, checks the certificate for the NAME, and stores name, route and last address', async () => {
        const home = await tempHome()
        const cert = makeCert(NAME)
        const port = await startTls(cert)
        const result = await followInChild({ home, caFile: cert.file, found: { ok: true, route: 'beacon', address: '127.0.0.1', port, name: NAME } })
        expect(result).toMatchObject({ ok: true, via: 'beacon', name: { label: 'ponyo-k7q2', zone: 'test-zone.example' }, address: '127.0.0.1' })
        const entry = readFollows(path.join(home, 'data')).jam
        expect(entry.remote).toBe(`https://${NAME}:${port}/serverXR`)
        expect(entry).toMatchObject({ name: { label: 'ponyo-k7q2', zone: 'test-zone.example' }, via: 'beacon', lastAddress: '127.0.0.1' })
        // Not a pin: a named follow looks the host up again when it moves.
        expect(entry.address).toBeUndefined()
    })

    it('refuses a machine whose certificate is for another name, even at the address the beacon said', async () => {
        const home = await tempHome()
        const liar = makeCert('someone-else.test-zone.example')
        const port = await startTls(liar)
        const result = await followInChild({ home, caFile: liar.file, found: { ok: true, route: 'beacon', address: '127.0.0.1', port, name: NAME } })
        expect(result).toMatchObject({ ok: false, reason: 'cert-mismatch' })
        expect(readFollows(path.join(home, 'data'))).toEqual({})
    })

    it('a certificate nobody trusts is refused too (a beacon is only a hint)', async () => {
        const home = await tempHome()
        const cert = makeCert(NAME)
        const port = await startTls(cert)
        const other = makeCert('unrelated-ca.example')
        const result = await followInChild({ home, caFile: other.file, found: { ok: true, route: 'dns', address: '127.0.0.1', port, name: NAME } })
        expect(result.ok).toBe(false)
        expect(readFollows(path.join(home, 'data'))).toEqual({})
    })
})

describe('the follow record', () => {
    it('keeps name, route and last address in both stores, and nothing extra for a URL follow', async () => {
        const home = await tempHome()
        const data = path.join(home, 'data')
        const entry = { remote: `https://${NAME}/serverXR`, token: 'k', name: { label: 'ponyo-k7q2', zone: 'test-zone.example' }, via: 'dns', lastAddress: '192.168.1.5' }
        await addFollow(data, 'jam', entry)
        await store.addFollow(data, 'jam2', entry)
        const both = readFollows(data)
        expect(both.jam).toMatchObject({ name: entry.name, via: 'dns', lastAddress: '192.168.1.5' })
        expect(Object.keys(both.jam)).toEqual(Object.keys(both.jam2))
        await addFollow(data, 'plain', { remote: 'https://local.thedi.studio/serverXR', token: 'k' })
        expect(readFollows(data).plain).not.toHaveProperty('name')
        expect(readFollows(data).plain).not.toHaveProperty('lastAddress')
    })

    it('recordResolved moves the last address and route, writes only on change, ignores URL follows', async () => {
        const home = await tempHome()
        const data = path.join(home, 'data')
        await addFollow(data, 'jam', { remote: `https://${NAME}/serverXR`, token: 'k', name: { label: 'ponyo-k7q2', zone: 'test-zone.example' }, via: 'dns', lastAddress: '192.168.1.5' })
        await addFollow(data, 'plain', { remote: 'https://local.thedi.studio/serverXR', token: 'k' })
        expect(await store.recordResolved(data, 'jam', { address: '192.168.1.5', via: 'dns' })).toBe(false)
        expect(await store.recordResolved(data, 'jam', { address: '192.168.1.77', via: 'beacon', remote: `https://${NAME}:8443/serverXR` })).toBe(true)
        expect(readFollows(data).jam).toMatchObject({ lastAddress: '192.168.1.77', via: 'beacon', remote: `https://${NAME}:8443/serverXR`, token: 'k' })
        expect(await store.recordResolved(data, 'plain', { address: '10.0.0.1', via: 'dns' })).toBe(false)
        expect(await store.recordResolved(data, 'gone', { address: '10.0.0.1', via: 'dns' })).toBe(false)
    })
})

describe('what `di follow` and `di follows` print', () => {
    it('di follow says which route found the host, and that the name stays', () => {
        const text = strip(ui.following('jam', `https://${NAME}/serverXR`, true, '192.168.15.53', { name: { label: 'ponyo-k7q2', zone: 'test-zone.example' }, via: 'beacon' }))
        expect(text).toContain('found ponyo-k7q2 by its beacon on this wifi, at 192.168.15.53')
        expect(strip(ui.following('jam', 'https://x', true, '100.1.1.1'))).toContain('the name stays — the socket goes to 100.1.1.1')
    })

    it('di follows shows the name and the route in place of the host', () => {
        const follows = {
            jam: { remote: `https://${NAME}/serverXR`, name: { label: 'ponyo-k7q2', zone: 'test-zone.example' }, via: 'last', lastAddress: '192.168.15.53' },
            main2: { remote: 'https://local.thedi.studio/serverXR' }
        }
        const text = strip(ui.followList(follows, [], null))
        expect(text).toContain(`ponyo-k7q2.test-zone.example (last 192.168.15.53)`)
        expect(text).toContain('https://local.thedi.studio')
    })

    it('not found names each place it looked', () => {
        const text = strip(ui.followNameNotFound(NAME, ['beacon', 'dns', 'last']))
        expect(text).toContain(`could not find ${NAME}`)
        expect(text).toContain('its beacon on this wifi, its name in DNS, the last address that worked')
        expect(text).toContain('--at <address>')
    })
})
