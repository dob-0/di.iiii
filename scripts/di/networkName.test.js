// @vitest-environment node
//
// `di name`: claim, signed broker calls, the DNS-01 order, renewal and the status line — against a fake broker (a fetch
// function that records what it was sent and verifies the signature with the public key from the claim) and a fake
// acme-client. A temp folder per test for DI_HOME and for the login home. Never here: a real broker, a real ACME
// server, Cloudflare, the real ~/.di or ~/.config.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { parseArgs } from './args.mjs'
import {
    cmdName, daysLeft, handleOf, LE_STAGING, maybeRenewName, needsRenewal, renewIfDue, signRequest, sha256hex, statusLine, verifyRequest, loadAcme
} from './networkName.mjs'
import { ensureInstallKey, nameFiles, publicKeyOf, readCertInfo, readName } from './nameStore.mjs'
import { paths } from './paths.mjs'
import { writeLogin } from './loginStore.mjs'
import { readState } from './state.mjs'

const posix = process.platform !== 'win32'
const NOW = Date.parse('2026-10-28T12:00:00Z')
const DAY = 86400000
const mode = (file) => fs.statSync(file).mode & 0o777

let home
let loginHome
const tmp = []
const mk = (prefix) => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); tmp.push(dir); return dir }

beforeEach(() => {
    home = mk('di-name-home-')
    loginHome = mk('di-name-login-')
    writeLogin({ home: loginHome, key: 'dev', entry: { token: 'dii_cli_tok.secret', base: 'https://dev.diiii.xyz', site: 'https://dev.diiii.xyz', user: { id: 'u1', name: 'Ponyo Aylmo' } } })
})
afterEach(() => { for (const dir of tmp.splice(0)) fs.rmSync(dir, { recursive: true, force: true }) })

/** A broker that answers the contract and checks every signed call against the key it was claimed with. */
const fakeBroker = ({ claimStatus = 201, labelOf = 'ponyo-k7q2', zone = 'di-studio.xyz', failTxt = false } = {}) => {
    const calls = []
    let pubkey = null
    const fetchImpl = async (url, init = {}) => {
        const u = new URL(url)
        const body = init.body || ''
        const headers = init.headers || {}
        const call = { method: init.method, path: u.pathname, body: body ? JSON.parse(body) : null, headers }
        calls.push(call)
        const json = (status, data) => ({ status, json: async () => data })
        if (u.pathname === '/v1/claim') {
            if (claimStatus === 409) return json(409, { error: 'label limit' })
            pubkey = call.body.pubkey
            return json(201, { label: labelOf, zone, name: `${labelOf}.${zone}`, record: '127.0.0.1' })
        }
        // A broker that restarted still has the key it stored at the claim: here, the one the claim wrote to install.pub.
        pubkey ??= fs.readFileSync(nameFiles(home).installPub, 'utf8').trim()
        call.verified = verifyRequest({ method: init.method, path: u.pathname, ts: headers['x-di-ts'], body, sig: headers['x-di-sig'], publicKey: pubkey })
        if (failTxt) return json(503, { error: 'cloudflare down' })
        return { status: 204, json: async () => { throw new Error('no body') } }
    }
    return { fetchImpl, calls }
}

/** acme-client, shrunk to what di uses; runs the two authorisations in parallel the way the real client does. */
const fakeAcme = ({ notAfter = new Date(NOW + 90 * DAY), failAuto = false } = {}) => {
    const log = { directoryUrls: [], csr: null, values: [] }
    class Client {
        constructor(opts) { log.directoryUrls.push(opts.directoryUrl); log.accountKey = opts.accountKey }
        async auto(opts) {
            if (failAuto) { await opts.challengeCreateFn({}, {}, 'x'); await opts.challengeRemoveFn({}, {}, 'x'); throw new Error('order invalid') }
            log.opts = opts
            await Promise.all(['digest-one', 'digest-two'].map(async (v) => {
                await opts.challengeCreateFn({}, {}, v)
                log.values.push(v)
                await new Promise((r) => { setTimeout(r, 5) })
                await opts.challengeRemoveFn({}, {}, v)
            }))
            return '-----BEGIN CERTIFICATE-----\nFAKE\n-----END CERTIFICATE-----\n'
        }
    }
    const acme = {
        Client,
        crypto: {
            createCsr: async (data) => { log.csr = data; return [null, 'csr-bytes'] },
            readCertificateInfo: () => ({ notAfter, notBefore: new Date(NOW) })
        }
    }
    return { acme, log }
}

const deps = (extra = {}) => {
    const out = { says: [], fails: [] }
    const broker = extra.broker || fakeBroker()
    const acme = extra.acme || fakeAcme()
    const d = {
        home, loginHome, env: {}, fetchImpl: broker.fetchImpl, loadAcme: async () => acme.acme, now: () => NOW,
        say: (t) => out.says.push(t), fail: (t) => out.fails.push(t), ...extra.d
    }
    return { d, out, broker, acme }
}

const run = (argv, extra) => { const x = deps(extra); return cmdName(parseArgs(argv), x.d).then((code) => ({ code, ...x })) }

describe('the install key and the claim', () => {
    it('claims a name and writes name.json, install.key (600) and install.pub', async () => {
        const { code, out, broker } = await run(['name', '--staging'])
        expect(code).toBe(0)
        const f = nameFiles(home)
        expect(readName(home)).toMatchObject({ label: 'ponyo-k7q2', zone: 'di-studio.xyz', name: 'ponyo-k7q2.di-studio.xyz', brokerUrl: 'https://name.di-studio.xyz' })
        expect(fs.existsSync(f.installPub)).toBe(true)
        expect(out.says[0]).toBe('claimed ponyo-k7q2.di-studio.xyz')
        expect(broker.calls[0].path).toBe('/v1/claim')
        if (posix) expect(mode(f.installKey)).toBe(0o600)
    })

    it('sends the public key, the login token and a handle as labelHint — never the private key', async () => {
        const { broker } = await run(['name'])
        const claim = broker.calls[0].body
        expect(claim.loginToken).toBe('dii_cli_tok.secret')
        expect(claim.labelHint).toBe('ponyo-aylmo')
        expect(claim.pubkey).toBe(publicKeyOf(fs.readFileSync(nameFiles(home).installKey, 'utf8')))
        expect(JSON.stringify(broker.calls)).not.toContain('PRIVATE KEY')
        expect(fs.readFileSync(nameFiles(home).installPub, 'utf8').trim()).toBe(claim.pubkey)
    })

    it('keeps the same install key on a second run', async () => {
        const a = await ensureInstallKey(home)
        const b = await ensureInstallKey(home)
        expect(b).toEqual(a)
    })

    it('says to sign in when there is no login, and writes no name', async () => {
        fs.rmSync(path.join(loginHome, '.config'), { recursive: true, force: true })
        const { code, out } = await run(['name'])
        expect(code).toBe(1)
        expect(out.fails[0]).toContain('di login')
        expect(readName(home)).toBeNull()
    })

    it('a 409 says the account is at 3 names and writes no name', async () => {
        const { code, out } = await run(['name'], { broker: fakeBroker({ claimStatus: 409 }) })
        expect(code).toBe(1)
        expect(out.fails[0]).toContain('3 names')
        expect(readName(home)).toBeNull()
    })

    it('handleOf makes a DNS-safe handle, never a full name with marks or spaces', () => {
        expect(handleOf({ name: 'Ponyo Aylmo' })).toBe('ponyo-aylmo')
        expect(handleOf({ name: 'Zoë  K.' })).toBe('zoe-k')
        expect(handleOf({})).toBe('')
    })

    it('uses DI_NAME_BROKER when set and records it', async () => {
        const { broker } = await run(['name'], { d: { env: { DI_NAME_BROKER: 'https://broker.test/' } } })
        expect(broker.calls[0].path).toBe('/v1/claim')
        expect(readName(home).brokerUrl).toBe('https://broker.test')
    })
})

describe('signed requests', () => {
    it('signs method, path, ts and the body hash — and verifies with the public key', async () => {
        const { privateKeyPem, publicKey } = await ensureInstallKey(home)
        const args = { method: 'PUT', path: '/v1/labels/x/txt', ts: '1790000000', body: '{"a":1}' }
        const sig = signRequest({ ...args, privateKeyPem })
        expect(verifyRequest({ ...args, sig, publicKey })).toBe(true)
        expect(verifyRequest({ ...args, body: '{"a":2}', sig, publicKey })).toBe(false)
        expect(verifyRequest({ ...args, path: '/v1/labels/y/txt', sig, publicKey })).toBe(false)
        expect(verifyRequest({ ...args, ts: '1790000001', sig, publicKey })).toBe(false)
    })

    it('the signed string is the contract: METHOD\\nPATH\\nTS\\nsha256hex(body)', async () => {
        const { privateKeyPem, publicKey } = await ensureInstallKey(home)
        const sig = signRequest({ method: 'DELETE', path: '/p', ts: '5', body: '', privateKeyPem })
        const key = crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: publicKey }, format: 'jwk' })
        expect(crypto.verify(null, Buffer.from(`DELETE\n/p\n5\n${sha256hex('')}`), key, Buffer.from(sig, 'base64url'))).toBe(true)
    })
})

describe('the certificate order', () => {
    it('sets and deletes the TXT record through the broker, signed, one after the other', async () => {
        const { code, broker, acme } = await run(['name'])
        expect(code).toBe(0)
        const txt = broker.calls.filter((c) => c.path.endsWith('/txt'))
        expect(txt.map((c) => c.method)).toEqual(['PUT', 'DELETE', 'PUT', 'DELETE'])
        expect(txt.every((c) => c.verified === true)).toBe(true)
        expect(txt.every((c) => c.headers['x-di-label'] === 'ponyo-k7q2')).toBe(true)
        expect(txt[0].path).toBe('/v1/labels/ponyo-k7q2/txt')
        expect(txt[0].body).toEqual({ name: '_acme-challenge', value: 'digest-one' })
        expect(txt[2].body.value).toBe('digest-two')
        expect(acme.log.values).toEqual(['digest-one', 'digest-two'])
    })

    it('orders the name and its wildcard, from production by default and staging on --staging', async () => {
        const prod = await run(['name'])
        expect(prod.acme.log.csr).toEqual({ commonName: 'ponyo-k7q2.di-studio.xyz', altNames: ['ponyo-k7q2.di-studio.xyz', '*.ponyo-k7q2.di-studio.xyz'] })
        expect(prod.acme.log.directoryUrls[0]).toBe('https://acme-v02.api.letsencrypt.org/directory')
        fs.rmSync(nameFiles(home).dir, { recursive: true })
        const stg = await run(['name', '--staging'])
        expect(stg.acme.log.directoryUrls[0]).toBe(LE_STAGING)
        expect(stg.out.says.at(-1)).toContain('STAGING')
    })

    it('asks for dns-01 and agrees to the terms', async () => {
        const { acme } = await run(['name'])
        expect(acme.log.opts.challengePriority).toEqual(['dns-01'])
        expect(acme.log.opts.termsOfServiceAgreed).toBe(true)
    })

    it('writes key.pem (600, made locally), cert.pem, cert.json and the account key (600)', async () => {
        await run(['name'])
        const f = nameFiles(home)
        expect(fs.readFileSync(f.key, 'utf8')).toContain('PRIVATE KEY')
        expect(fs.readFileSync(f.cert, 'utf8')).toContain('BEGIN CERTIFICATE')
        expect(readCertInfo(home)).toEqual({ notAfter: new Date(NOW + 90 * DAY).toISOString(), issuedAt: new Date(NOW).toISOString(), names: ['ponyo-k7q2.di-studio.xyz', '*.ponyo-k7q2.di-studio.xyz'] })
        if (posix) for (const file of [f.key, f.acmeAccountKey, f.installKey]) expect(mode(file)).toBe(0o600)
    })

    it('never touches ~/.di/tls/', async () => {
        await run(['name'])
        expect(fs.existsSync(paths(home).tls)).toBe(false)
    })

    it('a failed order still deletes the TXT it set and leaves no certificate', async () => {
        const { code, broker, out } = await run(['name'], { acme: fakeAcme({ failAuto: true }) })
        expect(code).toBe(1)
        expect(broker.calls.filter((c) => c.path.endsWith('/txt')).map((c) => c.method)).toEqual(['PUT', 'DELETE'])
        expect(out.fails[0]).toContain('order invalid')
        expect(fs.existsSync(nameFiles(home).cert)).toBe(false)
    })

    it('a broker that refuses the TXT says so in its own words', async () => {
        const { code, out } = await run(['name'], { broker: fakeBroker({ failTxt: true }) })
        expect(code).toBe(1)
        expect(out.fails[0]).toContain('503')
        expect(out.fails[0]).toContain('cloudflare down')
    })

    it('says plainly when acme-client is not installed', async () => {
        const { code, out } = await run(['name'], { d: { loadAcme: async () => { const e = new Error('certificates are not installed in this copy of di (acme-client is missing)'); e.code = 'ACME_NOT_INSTALLED'; throw e } } })
        expect(code).toBe(1)
        expect(out.fails[0]).toContain('not installed')
    })

    it('loadAcme finds acme-client from a checkout (serverXR/node_modules)', async () => {
        const acme = await loadAcme()
        expect(typeof acme.Client).toBe('function')
        expect(typeof acme.crypto.createCsr).toBe('function')
    })
})

describe('renewal', () => {
    const info = (days) => ({ notAfter: new Date(NOW + days * DAY).toISOString() })

    it('threshold: renews below 30 days, not at 30 or above', () => {
        expect(needsRenewal(info(29.9), NOW)).toBe(true)
        expect(needsRenewal(info(30), NOW)).toBe(false)
        expect(needsRenewal(info(89), NOW)).toBe(false)
        expect(needsRenewal(null, NOW)).toBe(true)
        expect(daysLeft(info(10), NOW)).toBe(10)
    })

    it('renewIfDue leaves a fresh certificate alone and makes no broker call', async () => {
        await run(['name'])
        const x = deps()
        const result = await renewIfDue(x.d)
        expect(result.outcome).toBe('fresh')
        expect(x.broker.calls).toHaveLength(0)
    })

    it('renewIfDue orders again when 20 days are left, and writes the new date', async () => {
        await run(['name'])
        const later = NOW + 70 * DAY
        const x = deps({ d: { now: () => later }, acme: fakeAcme({ notAfter: new Date(later + 90 * DAY) }) })
        const result = await renewIfDue(x.d)
        expect(result.outcome).toBe('renewed')
        expect(readCertInfo(home).notAfter).toBe(new Date(later + 90 * DAY).toISOString())
    })

    it('di name --renew says "nothing changed" while the certificate is good', async () => {
        await run(['name'])
        const { code, out, broker } = await run(['name', '--renew'])
        expect(code).toBe(0)
        expect(out.says[0]).toContain('nothing changed')
        expect(broker.calls).toHaveLength(0)
    })

    it('a failed renewal keeps the old certificate and says so', async () => {
        await run(['name'])
        const before = fs.readFileSync(nameFiles(home).cert, 'utf8')
        const later = NOW + 70 * DAY
        const x = deps({ d: { now: () => later }, acme: fakeAcme({ failAuto: true }) })
        const result = await renewIfDue(x.d)
        expect(result.outcome).toBe('failed')
        expect(result.error).toContain('order invalid')
        expect(fs.readFileSync(nameFiles(home).cert, 'utf8')).toBe(before)
    })

    it('maybeRenewName asks once a day, logs one line on success and one on failure', async () => {
        await run(['name'])
        const later = NOW + 70 * DAY
        const ok = deps({ d: { now: () => later }, acme: fakeAcme({ notAfter: new Date(later + 90 * DAY) }) })
        expect((await maybeRenewName(ok.d)).outcome).toBe('renewed')
        expect((await maybeRenewName(ok.d)).outcome).toBe('skipped')
        expect(readState(home).lastNameCheck).toBe(new Date(later).toISOString())
        const log = fs.readFileSync(path.join(paths(home).logs, 'name.log'), 'utf8').trim().split('\n')
        expect(log).toHaveLength(1)
        expect(log[0]).toContain('renewed ponyo-k7q2.di-studio.xyz')

        const muchLater = later + 70 * DAY
        const bad = deps({ d: { now: () => muchLater }, acme: fakeAcme({ failAuto: true }) })
        expect((await maybeRenewName(bad.d)).outcome).toBe('failed')
        const log2 = fs.readFileSync(path.join(paths(home).logs, 'name.log'), 'utf8').trim().split('\n')
        expect(log2).toHaveLength(2)
        expect(log2[1]).toContain('renewal failed')
    })

    it('maybeRenewName does nothing on an install with no name', async () => {
        const x = deps()
        expect((await maybeRenewName(x.d)).outcome).toBe('none')
        expect(fs.existsSync(paths(home).state)).toBe(false)
    })
})

describe('status line and --forget', () => {
    it('di status line says none, then the name without a certificate, then the date', async () => {
        expect(statusLine(home)).toBe('name: none — run di name')
        const x = deps({ acme: fakeAcme({ failAuto: true }) })
        await cmdName(parseArgs(['name']), x.d)
        expect(statusLine(home)).toBe('name: ponyo-k7q2.di-studio.xyz · no certificate yet — run di name')
        fs.rmSync(nameFiles(home).dir, { recursive: true })
        await run(['name'])
        expect(statusLine(home)).toBe('name: ponyo-k7q2.di-studio.xyz · certificate until 2027-01-26')
    })

    it('di name --status prints that line from local files with no broker call', async () => {
        await run(['name'])
        const { out, broker } = await run(['name', '--status'])
        expect(out.says[0]).toContain('certificate until 2027-01-26')
        expect(broker.calls).toHaveLength(0)
    })

    it('--forget removes the local files, says the broker keeps the label, and leaves ~/.di/tls alone', async () => {
        await run(['name'])
        fs.mkdirSync(paths(home).tls, { recursive: true })
        fs.writeFileSync(paths(home).tlsCert, 'mine')
        const { code, out, broker } = await run(['name', '--forget'])
        expect(code).toBe(0)
        expect(out.says[0]).toContain('broker keeps the label')
        expect(fs.existsSync(nameFiles(home).dir)).toBe(false)
        expect(fs.readFileSync(paths(home).tlsCert, 'utf8')).toBe('mine')
        expect(broker.calls).toHaveLength(0)
        expect(statusLine(home)).toBe('name: none — run di name')
    })

    it('di name again with a good certificate prints the status and calls nothing', async () => {
        await run(['name'])
        const { out, broker } = await run(['name'])
        expect(out.says[0]).toContain('certificate until')
        expect(broker.calls).toHaveLength(0)
    })
})
