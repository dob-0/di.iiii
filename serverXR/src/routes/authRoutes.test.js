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
})
