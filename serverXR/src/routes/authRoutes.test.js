import crypto from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { registerAuthRoutes } from './authRoutes.js'
import { signLoginState } from '../loginState.js'

// registerAuthRoutes registers passport strategies as a side effect, but this
// test only needs the plain Express-style route handlers it wires up — a
// fake router captures them without touching passport/network at all.
function makeFakeRouter() {
  const routes = {}
  const record = (method) => (path, ...handlers) => {
    routes[`${method} ${path}`] = handlers
  }
  return {
    routes,
    get: record('get'),
    use: () => {}
  }
}

const baseConfig = {
  oauth: {
    frontendUrl: 'https://app.example',
    callbackBase: 'https://app.example',
    github: { enabled: false, clientId: 'gh-client-id', clientSecret: 'gh-client-secret' },
    google: { enabled: false, clientId: 'g-client-id', clientSecret: 'g-client-secret' }
  },
  auth: { sessionSecret: 'test-secret' }
}

describe('registerAuthRoutes login CSRF state', () => {
  it('the github callback route rejects a request with no state param', () => {
    const router = makeFakeRouter()
    registerAuthRoutes(router, {
      config: { ...baseConfig, oauth: { ...baseConfig.oauth, github: { ...baseConfig.oauth.github, enabled: true } } },
      createAuthSessionValue: vi.fn(),
      setAuthSessionCookie: vi.fn()
    })
    const [requireValidLoginState] = router.routes['get /api/auth/github/callback']
    const req = { query: {} }
    const res = { redirect: vi.fn() }
    const next = vi.fn()
    requireValidLoginState(req, res, next)
    expect(res.redirect).toHaveBeenCalledWith('https://app.example?auth=error')
    expect(next).not.toHaveBeenCalled()
  })

  it('the github callback route rejects a tampered state param', () => {
    const router = makeFakeRouter()
    registerAuthRoutes(router, {
      config: { ...baseConfig, oauth: { ...baseConfig.oauth, github: { ...baseConfig.oauth.github, enabled: true } } },
      createAuthSessionValue: vi.fn(),
      setAuthSessionCookie: vi.fn()
    })
    const [requireValidLoginState] = router.routes['get /api/auth/github/callback']
    const forged = signLoginState('a-different-secret')
    const req = { query: { state: forged } }
    const res = { redirect: vi.fn() }
    const next = vi.fn()
    requireValidLoginState(req, res, next)
    expect(res.redirect).toHaveBeenCalledWith('https://app.example?auth=error')
    expect(next).not.toHaveBeenCalled()
  })

  it('the github callback route accepts a correctly signed state', () => {
    const router = makeFakeRouter()
    registerAuthRoutes(router, {
      config: { ...baseConfig, oauth: { ...baseConfig.oauth, github: { ...baseConfig.oauth.github, enabled: true } } },
      createAuthSessionValue: vi.fn(),
      setAuthSessionCookie: vi.fn()
    })
    const [requireValidLoginState] = router.routes['get /api/auth/github/callback']
    const valid = signLoginState('test-secret')
    const req = { query: { state: valid } }
    const res = { redirect: vi.fn() }
    const next = vi.fn()
    requireValidLoginState(req, res, next)
    expect(next).toHaveBeenCalled()
    expect(res.redirect).not.toHaveBeenCalled()
  })

  it('the state secret fallback (no auth.sessionSecret) is stable across separate process-like instances', () => {
    // Regression guard: the fallback used to be `crypto.randomBytes` generated once
    // per module load, so a state signed on one process (or one route registration)
    // failed to verify on another — exactly what happens when a host recycles/spawns
    // multiple server processes between the OAuth authorize and callback hops.
    const configNoSessionSecret = {
      ...baseConfig,
      oauth: { ...baseConfig.oauth, github: { ...baseConfig.oauth.github, enabled: true } },
      auth: { sessionSecret: '' }
    }

    const routerB = makeFakeRouter()
    registerAuthRoutes(routerB, {
      config: configNoSessionSecret,
      createAuthSessionValue: vi.fn(),
      setAuthSessionCookie: vi.fn()
    })
    const [requireValidLoginStateB] = routerB.routes['get /api/auth/github/callback']

    // Signed by "process A" (an independently derived fallback secret)...
    const stateSignedElsewhere = signLoginState(
      crypto
        .createHash('sha256')
        .update(`login-state:${configNoSessionSecret.oauth.github.clientSecret}|${configNoSessionSecret.oauth.google.clientSecret}`)
        .digest('hex')
    )

    // ...must still verify on "process B" (routerB's independently derived fallback secret).
    const req = { query: { state: stateSignedElsewhere } }
    const res = { redirect: vi.fn() }
    const next = vi.fn()
    requireValidLoginStateB(req, res, next)
    expect(next).toHaveBeenCalled()
    expect(res.redirect).not.toHaveBeenCalled()
  })

  it('the github authorize route signs a fresh state on every request, not once at registration', () => {
    // Regression guard for a real production incident (2026-07-16): the route handler used
    // to be `passport.authenticate('github', { state: signLoginState(stateSecret) })` passed
    // directly to router.get — signLoginState() ran once, at route-registration time, and
    // that single state value got baked into the closure for the rest of the process's life.
    // Every login shared the same state token, so it only worked within STATE_TTL_MS (10 min)
    // of server start and failed with "Sign-in failed" for every login after that, until the
    // next restart — live-verified: two curl requests seconds apart returned an identical
    // `state` in the redirect Location header.
    const router = makeFakeRouter()
    registerAuthRoutes(router, {
      config: { ...baseConfig, oauth: { ...baseConfig.oauth, github: { ...baseConfig.oauth.github, enabled: true } } },
      createAuthSessionValue: vi.fn(),
      setAuthSessionCookie: vi.fn()
    })
    const [authorizeHandler] = router.routes['get /api/auth/github']

    const extractState = () => {
      const res = { redirect: vi.fn(), setHeader: vi.fn(), end: vi.fn(), statusCode: 0 }
      authorizeHandler({ query: {} }, res, vi.fn())
      const [, location] = res.setHeader.mock.calls.find(([header]) => header === 'Location')
      return new URL(location).searchParams.get('state')
    }

    const first = extractState()
    const second = extractState()
    expect(first).toBeTruthy()
    expect(second).toBeTruthy()
    expect(first).not.toBe(second)
  })
})

describe('registerAuthRoutes post-login redirect', () => {
  const runCallback = async (frontendUrl, returnTo) => {
    const router = makeFakeRouter()
    registerAuthRoutes(router, {
      config: {
        ...baseConfig,
        authSession: { ttlMs: 60_000 },
        oauth: { ...baseConfig.oauth, frontendUrl, github: { ...baseConfig.oauth.github, enabled: true } }
      },
      createAuthSessionValue: () => ({ value: 'session' }),
      setAuthSessionCookie: vi.fn()
    })
    const handlers = router.routes['get /api/auth/github/callback']
    const finish = handlers[handlers.length - 1]
    const req = { query: { state: signLoginState('test-secret', { returnTo }) }, user: { id: 'u1', display_name: 'U', role: 'user', spaces: [] } }
    const res = { redirect: vi.fn() }
    const next = vi.fn()
    await finish(req, res, next)
    if (next.mock.calls.length) throw next.mock.calls[0][0]
    return res.redirect.mock.calls[0][0]
  }

  // A '/' frontendUrl (the default when OAUTH_FRONTEND_URL is unset) joined to
  // a '/spaces' returnTo used to make '//spaces' — which the browser resolves
  // as the host `spaces`, not our own path.
  it('never emits a protocol-relative destination when frontendUrl is the default "/"', async () => {
    expect(await runCallback('/', '/spaces')).toBe('/spaces?auth=ok')
  })

  it('does not double the slash when frontendUrl carries a trailing one', async () => {
    expect(await runCallback('https://app.example/', '/spaces')).toBe('https://app.example/spaces?auth=ok')
  })

  it('keeps an absolute frontendUrl joined to the return path', async () => {
    expect(await runCallback('https://app.example', '/spaces?invite=abc')).toBe('https://app.example/spaces?invite=abc&auth=ok')
  })

  it('falls back to the frontend root when there is no return path', async () => {
    expect(await runCallback('/', null)).toBe('/?auth=ok')
  })
})

// ── the bot's read-only "who is this chat" ────────────────────────────────
//
// The floor under a Telegram person doing anything in di.iiii. It must answer
// with the person's OWN scope and never mint anything — the whole reason the
// bot can be trusted with it is that there is nothing here to steal.
describe('POST /api/auth/telegram/whoami', () => {
    const telegramConfig = (overrides = {}) => ({
        ...baseConfig,
        oauth: {
            ...baseConfig.oauth,
            telegram: { enabled: true, loginSecret: 'bot-secret', botUsername: 'diiii111bot', ...overrides }
        }
    })

    function makePostRouter() {
        const routes = {}
        const record = (method) => (path, ...handlers) => { routes[`${method} ${path}`] = handlers }
        return { routes, get: record('get'), post: record('post'), use: () => {} }
    }

    const handlerFor = ({ listSpaces, findUser } = {}) => {
        const router = makePostRouter()
        registerAuthRoutes(router, {
            config: telegramConfig(),
            createAuthSessionValue: vi.fn(),
            setAuthSessionCookie: vi.fn(),
            listSpaces,
            findUser
        })
        return router.routes['post /api/auth/telegram/whoami'][0]
    }

    const call = async (handler, { secret = 'bot-secret', body = {} } = {}) => {
        const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this }, json(payload) { this.body = payload; return this } }
        await handler({ get: (name) => (name === 'x-telegram-login-secret' ? secret : undefined), body }, res, (e) => { throw e })
        return res
    }

    it('refuses without the bot secret', async () => {
        const res = await call(handlerFor(), { secret: 'wrong', body: { telegramId: '207260649' } })
        expect(res.statusCode).toBe(401)
    })

    it('refuses a telegram id that is not a number', async () => {
        // A caller inventing a provider_id is the one thing this boundary exists
        // to stop; the login-link route refuses the same shape.
        const res = await call(handlerFor(), { body: { telegramId: "1; drop" } })
        expect(res.statusCode).toBe(400)
    })

    it('answers "not signed in" plainly, rather than as an error', async () => {
        const res = await call(handlerFor({ findUser: () => null }), { body: { telegramId: '404404404' } })
        expect(res.statusCode).toBe(200)
        expect(res.body).toEqual({ bound: false })
    })

    it('answers with the person\u2019s own scope, and no credential', async () => {
        const handler = handlerFor({
            findUser: () => ({ id: 'u1', display_name: 'Gevorg', role: 'editor', spaces: ['dilijan', 'main'], isUnrestricted: false }),
            listSpaces: async () => [{ id: 'dilijan', label: 'Dilijan' }, { id: 'main', label: 'The front room' }, { id: 'secret', label: 'Not theirs' }]
        })
        const res = await call(handler, { body: { telegramId: '207260649' } })
        expect(res.body.bound).toBe(true)
        expect(res.body.label).toBe('Gevorg')
        expect(res.body.spaces.map((s) => s.id)).toEqual(['dilijan', 'main'])
        expect(res.body.spaces[0].label).toBe('Dilijan')
        // The whole point: nothing here can be used to act as this person.
        expect(JSON.stringify(res.body)).not.toMatch(/token|secret|session/i)
    })

    it('does not print an estate for an unrestricted account', async () => {
        const handler = handlerFor({
            findUser: () => ({ id: 'u2', display_name: 'Owner', role: 'admin', spaces: [], isUnrestricted: true }),
            listSpaces: async () => Array.from({ length: 40 }, (_, i) => ({ id: `s${i}`, label: `Space ${i}` }))
        })
        const res = await call(handler, { body: { telegramId: '1' } })
        expect(res.body.everything).toBe(true)
        expect(res.body.spaces).toEqual([])
    })

    it('still answers when the space store cannot be read', async () => {
        // A label is a nicety; the ids are the answer.
        const handler = handlerFor({
            findUser: () => ({ id: 'u3', display_name: 'Someone', role: 'editor', spaces: ['dilijan'], isUnrestricted: false }),
            listSpaces: async () => { throw new Error('disk gone') }
        })
        const res = await call(handler, { body: { telegramId: '2' } })
        expect(res.body.spaces).toEqual([{ id: 'dilijan', label: null }])
    })
})
