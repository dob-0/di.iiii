import { describe, expect, it, vi } from 'vitest'
import { signLoginState, verifyLoginState, readLoginState, sanitizeReturnTo, STATE_TTL_MS } from './loginState.js'

describe('loginState', () => {
  it('accepts a state it just signed', () => {
    const state = signLoginState('secret-a')
    expect(verifyLoginState('secret-a', state)).toBe(true)
  })

  it('rejects a state signed with a different secret', () => {
    const state = signLoginState('secret-a')
    expect(verifyLoginState('secret-b', state)).toBe(false)
  })

  it('rejects a tampered payload even if the mac format still parses', () => {
    const state = signLoginState('secret-a')
    const [, mac] = state.split('.')
    const tamperedPayload = Buffer.from(JSON.stringify({ n: 'evil', t: Date.now() })).toString('base64url')
    expect(verifyLoginState('secret-a', `${tamperedPayload}.${mac}`)).toBe(false)
  })

  it('rejects missing, empty, or malformed state', () => {
    expect(verifyLoginState('secret-a', undefined)).toBe(false)
    expect(verifyLoginState('secret-a', '')).toBe(false)
    expect(verifyLoginState('secret-a', 'not-a-valid-state')).toBe(false)
  })

  // Doors audit 2026-08-21: every OAuth sign-in returned to '/', losing the
  // destination and any ?invite= token with it. The signed state now carries
  // the path the person signed in from.
  it('round-trips a same-site returnTo path through the signed state', () => {
    const state = signLoginState('secret-a', { returnTo: '/gallery/studio?invite=tok' })
    expect(readLoginState('secret-a', state)?.r).toBe('/gallery/studio?invite=tok')
  })

  it('refuses to sign an off-site or malformed returnTo', () => {
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil', 'gallery', '', null, `/${'a'.repeat(700)}`]) {
      const state = signLoginState('secret-a', { returnTo: bad })
      expect(readLoginState('secret-a', state)?.r).toBeUndefined()
    }
  })

  it('sanitizeReturnTo admits only same-site paths', () => {
    expect(sanitizeReturnTo('/gallery/studio')).toBe('/gallery/studio')
    expect(sanitizeReturnTo('//evil.example')).toBeNull()
    expect(sanitizeReturnTo('https://evil.example')).toBeNull()
    expect(sanitizeReturnTo(42)).toBeNull()
  })

  it('rejects an expired state', () => {
    vi.useFakeTimers()
    try {
      const state = signLoginState('secret-a')
      vi.advanceTimersByTime(STATE_TTL_MS + 1)
      expect(verifyLoginState('secret-a', state)).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
