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
