// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const hub = require('./authHub.js')

const keys = hub.generateHubKeyPair()
const priv = hub.readKey(keys.privateKeyPem, 'private')
const pub = hub.readKey(keys.publicKeyPem, 'public')
const AUD = 'https://local.thedi.studio/serverXR/api/auth/hub/callback'
const NONCE = hub.newNonce()
const identity = { provider: 'google', providerId: '1181', email: 'a@b.c', name: 'A' }
const mint = (over = {}, opts = {}) => hub.signPass(priv, { aud: AUD, nonce: NONCE, ...identity, ...over }, opts)

describe('authHub pass', () => {
    it('a fresh pass for this address and this browser is accepted once', () => {
        const seen = hub.createSeenSet()
        const token = mint()
        const first = hub.verifyPass(pub, token, { aud: AUD, nonce: NONCE, seen })
        expect(first.ok).toBe(true)
        expect(first.claims.providerId).toBe('1181')
        expect(hub.verifyPass(pub, token, { aud: AUD, nonce: NONCE, seen })).toEqual({ ok: false, reason: 'replay' })
    })

    it('is refused on any other server (audience)', () => {
        expect(hub.verifyPass(pub, mint(), { aud: 'http://localhost:4362/serverXR/api/auth/hub/callback', nonce: NONCE }).reason).toBe('audience')
    })

    it('is refused in any other browser (nonce: a planted pass does not sign someone in)', () => {
        expect(hub.verifyPass(pub, mint(), { aud: AUD, nonce: hub.newNonce() }).reason).toBe('nonce')
    })

    it('expires after two minutes', () => {
        const old = mint({}, { now: Date.now() - (hub.PASS_TTL_S + 5) * 1000 })
        expect(hub.verifyPass(pub, old, { aud: AUD, nonce: NONCE }).reason).toBe('expired')
    })

    it('a pass signed by any other key, or edited, is refused', () => {
        const other = hub.generateHubKeyPair()
        const forged = hub.signPass(hub.readKey(other.privateKeyPem, 'private'), { aud: AUD, nonce: NONCE, ...identity })
        expect(hub.verifyPass(pub, forged, { aud: AUD, nonce: NONCE }).reason).toBe('signature')
        const [h, , s] = mint().split('.')
        const edited = Buffer.from(JSON.stringify({ aud: AUD, nonce: NONCE, ...identity, providerId: 'someone-else', iat: 1, exp: 9e9 })).toString('base64url')
        expect(hub.verifyPass(pub, `${h}.${edited}.${s}`, { aud: AUD, nonce: NONCE }).reason).toBe('signature')
    })

    it('alg:none and garbage are refused', () => {
        const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ aud: AUD, nonce: NONCE, ...identity })).toString('base64url')}.`
        expect(hub.verifyPass(pub, none, { aud: AUD, nonce: NONCE }).ok).toBe(false)
        expect(hub.verifyPass(pub, 'x.y', { aud: AUD, nonce: NONCE }).ok).toBe(false)
        expect(hub.verifyPass(null, mint(), { aud: AUD, nonce: NONCE }).reason).toBe('no-key')
    })

    it('reads keys written into env files three ways (PEM, \\n-escaped, base64)', () => {
        expect(hub.readKey(keys.publicKeyPem.replace(/\n/g, '\\n'), 'public')).toBeTruthy()
        expect(hub.readKey(Buffer.from(keys.publicKeyPem).toString('base64'), 'public')).toBeTruthy()
        expect(hub.readKey('not a key', 'public')).toBeNull()
    })
})

describe('authHub return addresses', () => {
    const ok = (u) => hub.isAllowedReturn(u)
    it('allows the front door, localhost stacks and the tailnet, at the callback path only', () => {
        expect(ok('https://local.thedi.studio/serverXR/api/auth/hub/callback')).toBe(true)
        expect(ok('http://localhost:4362/serverXR/api/auth/hub/callback')).toBe(true)
        expect(ok('http://feel.dii.localhost:8088/serverXR/api/auth/hub/callback')).toBe(true)
        expect(ok('https://aylmo.tail1234.ts.net/serverXR/api/auth/hub/callback')).toBe(true)
        expect(ok('https://dev.diiii.xyz/serverXR/api/auth/hub/callback')).toBe(true)
    })
    it('refuses anything else', () => {
        expect(ok('https://evil.example/serverXR/api/auth/hub/callback')).toBe(false)
        expect(ok('https://thedi.studio.evil.example/serverXR/api/auth/hub/callback')).toBe(false)
        expect(ok('https://evilthedi.studio/serverXR/api/auth/hub/callback')).toBe(false)
        expect(ok('http://local.thedi.studio/serverXR/api/auth/hub/callback')).toBe(false)          // not https
        expect(ok('https://local.thedi.studio/serverXR/api/auth/session')).toBe(false)              // wrong path
        expect(ok('https://local.thedi.studio/serverXR/api/auth/hub/callback?next=x')).toBe(false)  // query
        expect(ok('https://u:p@local.thedi.studio/serverXR/api/auth/hub/callback')).toBe(false)     // credentials
        expect(ok('http://192.168.88.231:4362/serverXR/api/auth/hub/callback')).toBe(false)         // LAN IP: opt-in only
        expect(ok('javascript:alert(1)')).toBe(false)
    })
    it('a hub can opt a LAN address in explicitly', () => {
        expect(hub.isAllowedReturn('http://192.168.88.231:4362/serverXR/api/auth/hub/callback', ['http://192.168.88.231:*'])).toBe(true)
    })
})
