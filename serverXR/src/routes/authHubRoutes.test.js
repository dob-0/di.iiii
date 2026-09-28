// The sign-in hub, end to end through the real route handlers: a server with no
// Google registration sends a person to the hub, the hub (after "Google") mints
// a pass, and the first server turns it into its own session. Only Google's own
// step is stood in for; everything this repo does runs for real.
import { describe, expect, it, vi } from 'vitest'
import { registerAuthRoutes } from './authRoutes.js'
import { signLoginState } from '../loginState.js'
import { generateHubKeyPair, readKey } from '../authHub.js'

function makeFakeRouter() {
    const routes = {}
    return { routes, get: (path, ...h) => { routes[`get ${path}`] = h }, post: (path, ...h) => { routes[`post ${path}`] = h }, use: () => {} }
}
const last = (handlers) => handlers[handlers.length - 1]

const KEYS = generateHubKeyPair()
const HUB_API = 'https://diiii.xyz/serverXR'
const google = (enabled) => ({ enabled, clientId: 'g', clientSecret: 'gs' })

function makeHub() {
    const router = makeFakeRouter()
    registerAuthRoutes(router, {
        config: {
            oauth: { frontendUrl: 'https://diiii.xyz', callbackBase: HUB_API, github: { enabled: false }, google: google(true) },
            auth: { sessionSecret: 'hub-secret' },
            authHub: { signingKey: readKey(KEYS.privateKeyPem, 'private'), allowedReturns: ['https://*.thedi.studio', 'http://localhost:*'] }
        },
        createAuthSessionValue: vi.fn(() => ({ value: 'hub-session' })),
        setAuthSessionCookie: vi.fn()
    })
    return router
}

function makeLocal({ fetchImpl } = {}) {
    const router = makeFakeRouter()
    const setAuthSessionCookie = vi.fn()
    const upsertUserImpl = vi.fn((u) => ({ id: 'local-1', provider: u.provider, provider_id: u.providerId, display_name: u.displayName, role: 'editor', spaces: [], tokenVersion: 0 }))
    registerAuthRoutes(router, {
        config: {
            oauth: { frontendUrl: '/', callbackBase: '', github: { enabled: false }, google: google(false) },
            auth: { sessionSecret: 'local-secret' },
            authSession: { ttlMs: 1000, cookieSecure: true },
            authHub: { url: HUB_API, publicKey: readKey(KEYS.publicKeyPem, 'public') }
        },
        createAuthSessionValue: vi.fn(({ session }) => ({ value: `session-for-${session.subject}` })),
        setAuthSessionCookie,
        upsertUserImpl,
        fetchImpl: fetchImpl || vi.fn(async () => ({ ok: true, json: async () => ({ publicKey: KEYS.publicKeyPem, providers: ['google'] }) }))
    })
    return { router, setAuthSessionCookie, upsertUserImpl }
}

// A browser at https://local.thedi.studio
const browserReq = (extra = {}) => ({ protocol: 'https', baseUrl: '/serverXR', get: (h) => (h === 'host' ? 'local.thedi.studio' : ''), query: {}, ...extra })
const res = () => { const r = { headers: [], redirect: vi.fn(), append: vi.fn((k, v) => r.headers.push(v)), status: vi.fn(() => r), json: vi.fn(), set: vi.fn() }; return r }

// Step 1+2: the local server sends the browser to the hub; the hub, after Google, mints a pass.
function signInAtHub(local, hub, { user = { provider: 'google', provider_id: '1181', email: 'g@x', display_name: 'Gevorg' }, returnTo = '/moxir' } = {}) {
    const r1 = res()
    last(local.router.routes['get /api/auth/google'])(browserReq({ query: { returnTo } }), r1)
    const toHub = new URL(r1.redirect.mock.calls[0][0])
    const cookie = r1.headers[0].split(';')[0]                       // "di_hub=<signed>"
    const r2 = res()
    const state = signLoginState('hub-secret', { hub: { ret: toHub.searchParams.get('return'), nonce: toHub.searchParams.get('nonce') } })
    return last(hub.routes['get /api/auth/google/callback'])({ query: { state }, user }, r2, (e) => { throw e })
        .then(() => ({ toHub, cookie, back: r2.redirect.mock.calls[0]?.[0] }))
}

describe('sign-in hub, end to end', () => {
    it('a server with no Google registration signs someone in with Google through the hub', async () => {
        const local = makeLocal(); const hub = makeHub()
        const { toHub, cookie, back } = await signInAtHub(local, hub)
        expect(toHub.origin + toHub.pathname).toBe('https://diiii.xyz/serverXR/api/auth/hub/start')
        expect(toHub.searchParams.get('return')).toBe('https://local.thedi.studio/serverXR/api/auth/hub/callback')
        expect(cookie).toMatch(/^di_hub=/)
        expect(back.startsWith('https://local.thedi.studio/serverXR/api/auth/hub/callback?pass=')).toBe(true)

        const r3 = res()
        await last(local.router.routes['get /api/auth/hub/callback'])(browserReq({ query: { pass: new URL(back).searchParams.get('pass') }, get: (h) => (h === 'host' ? 'local.thedi.studio' : h === 'cookie' ? cookie : '') }), r3, (e) => { throw e })
        expect(local.upsertUserImpl).toHaveBeenCalledWith(expect.objectContaining({ provider: 'google', providerId: '1181', displayName: 'Gevorg' }))
        expect(local.setAuthSessionCookie).toHaveBeenCalledWith(r3, 'session-for-local-1')
        expect(r3.redirect).toHaveBeenCalledWith('/moxir?auth=ok')
    })

    it('the same pass cannot be used twice', async () => {
        const local = makeLocal(); const hub = makeHub()
        const { cookie, back } = await signInAtHub(local, hub)
        const pass = new URL(back).searchParams.get('pass')
        const req = () => browserReq({ query: { pass }, get: (h) => (h === 'host' ? 'local.thedi.studio' : h === 'cookie' ? cookie : '') })
        await last(local.router.routes['get /api/auth/hub/callback'])(req(), res(), (e) => { throw e })
        const again = res()
        await last(local.router.routes['get /api/auth/hub/callback'])(req(), again, (e) => { throw e })
        expect(again.redirect).toHaveBeenCalledWith('/?auth=error&reason=hub')
        expect(local.setAuthSessionCookie).toHaveBeenCalledTimes(1)
    })

    it('a pass sent to someone else\'s browser (no matching cookie) does not sign them in', async () => {
        const local = makeLocal(); const hub = makeHub()
        const { back } = await signInAtHub(local, hub)
        const victim = res()
        await last(local.router.routes['get /api/auth/hub/callback'])(browserReq({ query: { pass: new URL(back).searchParams.get('pass') } }), victim, (e) => { throw e })
        expect(victim.redirect).toHaveBeenCalledWith('/?auth=error&reason=hub')
        expect(local.upsertUserImpl).not.toHaveBeenCalled()
    })

    it('a pass for one address is refused at another address of the same server', async () => {
        const local = makeLocal(); const hub = makeHub()
        const { cookie, back } = await signInAtHub(local, hub)
        const other = res()
        await last(local.router.routes['get /api/auth/hub/callback'])(browserReq({ query: { pass: new URL(back).searchParams.get('pass') }, get: (h) => (h === 'host' ? 'localhost:4362' : h === 'cookie' ? cookie : '') }), other, (e) => { throw e })
        expect(other.redirect).toHaveBeenCalledWith('/?auth=error&reason=hub')
    })

    it('the hub mints nothing for an address outside its allowlist', async () => {
        const hub = makeHub()
        const start = res()
        last(hub.routes['get /api/auth/hub/start'])({ query: { provider: 'google', return: 'https://evil.example/serverXR/api/auth/hub/callback', nonce: 'a'.repeat(32) } }, start, () => {})
        expect(start.status).toHaveBeenCalledWith(400)
        // …even if a state claiming such a return were somehow signed:
        const r = res()
        await last(hub.routes['get /api/auth/google/callback'])({ query: { state: signLoginState('hub-secret', { hub: { ret: 'https://evil.example/serverXR/api/auth/hub/callback', nonce: 'a'.repeat(32) } }) }, user: { provider: 'google', provider_id: '1' } }, r, (e) => { throw e })
        expect(r.redirect.mock.calls[0][0]).not.toMatch(/evil\.example/)
    })

    it('the hub publishes the key it signs with', () => {
        const hub = makeHub()
        const r = res()
        last(hub.routes['get /api/auth/hub/key'])({}, r)
        expect(r.json).toHaveBeenCalledWith({ publicKey: KEYS.publicKeyPem, providers: ['google'] })
    })
})

describe('sign-in hub: what the sign-in page is told', () => {
    const providers = async (local) => { const r = res(); await last(local.router.routes['get /api/auth/providers'])({}, r); return r.json.mock.calls[0][0] }

    it('online: Google is offered, via the hub', async () => {
        const p = await providers(makeLocal())
        expect(p.google).toBe(true)
        expect(p.hub).toEqual({ reachable: true, via: ['google'] })
    })

    it('offline: the hub does not answer, so Google is not offered (no dead button)', async () => {
        const p = await providers(makeLocal({ fetchImpl: vi.fn(async () => { throw new Error('ENETUNREACH') }) }))
        expect(p.google).toBe(false)
        expect(p.password).toBe(true)
        expect(p.hub).toEqual({ reachable: false, via: [] })
    })

    it('a hub answering with a different key than the pinned one is not trusted', async () => {
        const stranger = generateHubKeyPair()
        const p = await providers(makeLocal({ fetchImpl: vi.fn(async () => ({ ok: true, json: async () => ({ publicKey: stranger.publicKeyPem, providers: ['google'] }) })) }))
        expect(p.google).toBe(false)
        expect(p.hub.reachable).toBe(false)
    })
})
