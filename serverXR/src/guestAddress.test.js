// @vitest-environment node
//
// The place address (serverXR/src/guestAddress.js): the one https address a
// device without di opens, read from the certificate this server serves. It is
// never invented: no certificate, a wildcard, or a loopback-only start each
// say so instead of giving an address, and a name that resolves somewhere
// else is reported as such.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const express = require('express')
const {
    certificateNames, checkName, createGuestAddress, describeGuestAddress, registerGuestAddressRoute, CERT_SETTING
} = require('./guestAddress.js')

let tmp
const makeCert = (name, subj, san) => {
    const key = path.join(tmp, `${name}.key`)
    const cert = path.join(tmp, `${name}.pem`)
    const args = ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-keyout', key,
        '-out', cert, '-days', '1', '-nodes', '-subj', subj]
    if (san) args.push('-addext', `subjectAltName=${san}`)
    execFileSync('openssl', args, { stdio: 'ignore' })
    return fs.readFileSync(cert)
}

beforeAll(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guest-address-')) })
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

describe('certificateNames: the name `di up --lan` points the hook at', () => {
    it('reads the CN first, as scripts/di/state.mjs readCert does', () => {
        const pem = makeCert('cn', '/CN=local.thedi.studio', 'DNS:local.thedi.studio,DNS:hall.thedi.studio')
        expect(certificateNames(pem)).toMatchObject({ name: 'local.thedi.studio', names: ['local.thedi.studio', 'hall.thedi.studio'] })
    })
    it('falls back to the first DNS name when there is no CN', () => {
        const pem = makeCert('nocn', '/O=di', 'DNS:place.example.org')
        expect(certificateNames(pem)).toMatchObject({ name: 'place.example.org' })
    })
    it('null for something that is not a certificate', () => {
        expect(certificateNames('not a pem')).toBeNull()
        expect(certificateNames(null)).toBeNull()
    })
})

const LAN = { lan: true, addresses: ['192.168.1.20'] }
const LOOPBACK = { lan: false, addresses: [] }

describe('describeGuestAddress: every state, from facts only', () => {
    it('ready: the certificate name over https, on a --lan start', () => {
        const g = describeGuestAddress({ certificate: { name: 'local.thedi.studio' }, port: 443, listen: LAN })
        expect(g).toMatchObject({ state: 'ready', address: 'https://local.thedi.studio/', name: 'local.thedi.studio', lan: true })
    })
    it('carries a port that is not 443', () => {
        const g = describeGuestAddress({ certificate: { name: 'local.thedi.studio' }, port: 4000, listen: LAN })
        expect(g.address).toBe('https://local.thedi.studio:4000/')
    })
    it('not-on-network: the address is real, but this start is loopback only', () => {
        const g = describeGuestAddress({ certificate: { name: 'local.thedi.studio' }, port: 443, listen: LOOPBACK })
        expect(g).toMatchObject({ state: 'not-on-network', address: 'https://local.thedi.studio/', command: 'di up --lan' })
    })
    it('no-certificate: no address at all, and the setting named', () => {
        const g = describeGuestAddress({ certificate: null, port: 4000, listen: LAN })
        expect(g).toMatchObject({ state: 'no-certificate', address: null, name: null })
        expect(g.setting).toBe(CERT_SETTING)
        expect(CERT_SETTING).toContain('~/.di/tls/cert.pem')
    })
    it('wildcard: a name for many machines is an address for none', () => {
        const g = describeGuestAddress({ certificate: { name: '*.thedi.studio' }, port: 443, listen: LAN })
        expect(g).toMatchObject({ state: 'wildcard', address: null, name: '*.thedi.studio' })
    })
    it('says whether guests arrive with auth on', () => {
        expect(describeGuestAddress({ certificate: null, port: 1, listen: LAN, requireAuth: true }).guests).toBe(true)
        expect(describeGuestAddress({ certificate: null, port: 1, listen: LAN }).guests).toBe(false)
    })
})

describe('checkName: where the name points, asked, never guessed', () => {
    it('here', async () => {
        const lookup = async () => [{ address: '192.168.1.20', family: 4 }]
        expect(await checkName('x', { lookup, here: ['192.168.1.20'] })).toEqual({ pointsAt: ['192.168.1.20'], pointsHere: true, lookupError: null })
    })
    it('elsewhere', async () => {
        const lookup = async () => [{ address: '127.0.0.1', family: 4 }]
        expect(await checkName('x', { lookup, here: ['192.168.1.20'] })).toMatchObject({ pointsHere: false, pointsAt: ['127.0.0.1'] })
    })
    it('unknown when the lookup fails or hangs', async () => {
        const fail = async () => { const e = new Error('nope'); e.code = 'ENOTFOUND'; throw e }
        expect(await checkName('x', { lookup: fail, here: [] })).toEqual({ pointsAt: [], pointsHere: null, lookupError: 'ENOTFOUND' })
        const hang = () => new Promise(() => {})
        expect(await checkName('x', { lookup: hang, here: [], timeoutMs: 20 })).toMatchObject({ pointsHere: null, lookupError: 'timeout' })
    })
})

describe('createGuestAddress: per request, lookup cached', () => {
    const interfaces = { wlan0: [{ address: '192.168.1.20', family: 'IPv4', internal: false }] }
    it('asks the resolver once inside the cache window, again after it', async () => {
        let calls = 0
        let t = 0
        const answer = createGuestAddress({
            getCertificate: () => ({ name: 'local.thedi.studio' }),
            port: 443,
            listen: () => LAN,
            lookup: async () => { calls += 1; return [{ address: '192.168.1.20' }] },
            interfaces,
            now: () => t,
            ttlMs: 1000
        })
        expect(await answer()).toMatchObject({ state: 'ready', pointsHere: true })
        await answer()
        expect(calls).toBe(1)
        t = 2000
        await answer()
        expect(calls).toBe(2)
    })
    it('no address, no lookup', async () => {
        let calls = 0
        const answer = createGuestAddress({ getCertificate: () => null, port: 4000, listen: () => LAN, lookup: async () => { calls += 1; return [] }, interfaces })
        expect(await answer()).toMatchObject({ state: 'no-certificate', pointsHere: null })
        expect(calls).toBe(0)
    })
})

describe('GET /api/guest-address', () => {
    const saved = { NODE_ENV: process.env.NODE_ENV, DI_LOCAL: process.env.DI_LOCAL }
    const servers = []
    afterEach(() => {
        for (const s of servers.splice(0)) s.close()
        for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
    })
    const serve = (options) => new Promise((resolve) => {
        const app = express()
        const router = express.Router()
        registerGuestAddressRoute(router, options)
        app.use('/serverXR', router)
        const s = app.listen(0, '127.0.0.1', () => resolve(s.address().port))
        servers.push(s)
    })
    const get = (port) => new Promise((resolve, reject) => {
        http.get({ host: '127.0.0.1', port, path: '/serverXR/api/guest-address' }, (res) => {
            let body = ''
            res.on('data', (d) => { body += d })
            res.on('end', () => resolve({ status: res.statusCode, body, cache: res.headers['cache-control'] }))
        }).on('error', reject)
    })

    it('answers a local install with the place address', async () => {
        process.env.NODE_ENV = 'production'
        process.env.DI_LOCAL = '1'
        const port = await serve({
            getCertificate: () => ({ name: 'local.thedi.studio' }),
            port: 443,
            listen: () => LAN,
            lookup: async () => [{ address: '192.168.1.20' }],
            interfaces: { wlan0: [{ address: '192.168.1.20', family: 'IPv4', internal: false }] }
        })
        const res = await get(port)
        expect(res.status).toBe(200)
        expect(res.cache).toBe('no-store')
        expect(JSON.parse(res.body).guest).toMatchObject({ state: 'ready', address: 'https://local.thedi.studio/', pointsHere: true })
    })

    it('a hosted server does not admit the route exists', async () => {
        process.env.NODE_ENV = 'production'
        delete process.env.DI_LOCAL
        const port = await serve({ getCertificate: () => ({ name: 'diiii.xyz' }), port: 443, listen: () => LAN })
        expect((await get(port)).status).toBe(404)
    })
})
