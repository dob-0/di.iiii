import { describe, expect, it, vi } from 'vitest'
import { signLoginState, verifyLoginState, STATE_TTL_MS } from './loginState.js'

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
