import { readFileSync } from 'node:fs'
import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { mintTunnelToken, tunnelUrl, TOKEN_CHARS, TELEGRAM_PAYLOAD } from './tunnelToken.js'

// THE SHARED VECTOR. This is the whole reason this file exists.
//
// The tunnel has two implementations — this one mints, di.bo verifies — and the
// two previous two-halved protocols on this estate BOTH drifted silently while
// every test on both sides passed, because each side only ever asserted that it
// agreed with itself: first the Armenian address token (`ՊԱՀԱՊԱՆ→` vs
// `պահապան `), then the mesh channel prefix (`bridge:talk` vs `talk`). Each time
// a real visitor stood in front of something that could not hear them.
//
// So the vector is a file BOTH suites read. A change on either side fails here,
// not at the end of somebody's ritual. It is copied rather than imported
// because di-bo is a separate repo — and a copy that must match exactly is the
// point, not a shortcoming.
const VECTOR = {
  secret: 'tunnel-test-vector-secret',
  inscription: 'insc-a012122a-cbfa-4155-84e1-69d0a532c251',
  exp_unix_minutes: 29000000,
  token: 'AaASEirL-kFVhOFp0KUywlEBuoFAu5VhheohbVOrQR6a9rC0kg',
  token_length: 50
}

describe('the tunnel token matches di.bo byte for byte', () => {
  it('reproduces the shared vector exactly', () => {
    const now = (VECTOR.exp_unix_minutes - 24 * 60) * 60000
    const minted = mintTunnelToken(VECTOR.inscription, VECTOR.secret, { now })
    expect(minted.token).toBe(VECTOR.token)
  })

  it('is 50 chars and uses only the alphabet Telegram accepts', () => {
    const { token } = mintTunnelToken(VECTOR.inscription, VECTOR.secret)
    // Telegram's ?start= payload permits A-Za-z0-9_- and nothing else. A dotted
    // v1.<id>.<sig> form is rejected outright — the kind of thing discovered at
    // the end of a ritual rather than in CI.
    expect(token).toHaveLength(TOKEN_CHARS)
    expect(token).toHaveLength(VECTOR.token_length)
    expect(TELEGRAM_PAYLOAD.test(token)).toBe(true)
  })

  it('reports the expiry it actually signed, 24h out', () => {
    const now = 1_700_000_000_000
    const { token, expiresAt } = mintTunnelToken(VECTOR.inscription, VECTOR.secret, { now })
    const exp = Buffer.from(token, 'base64url').readUInt32BE(17)
    expect(exp).toBe(Math.floor(now / 60000) + 24 * 60)
    expect(expiresAt).toBe(exp * 60000)
  })

  it('binds the token to the crossing, so a different one signs differently', () => {
    const now = 1_700_000_000_000
    const a = mintTunnelToken('insc-a012122a-cbfa-4155-84e1-69d0a532c251', VECTOR.secret, { now })
    const b = mintTunnelToken('insc-b012122a-cbfa-4155-84e1-69d0a532c251', VECTOR.secret, { now })
    expect(a.token).not.toBe(b.token)
  })

  it('is deterministic — no random bytes, therefore no token table', () => {
    const now = 1_700_000_000_000
    expect(mintTunnelToken(VECTOR.inscription, VECTOR.secret, { now }).token)
      .toBe(mintTunnelToken(VECTOR.inscription, VECTOR.secret, { now }).token)
  })

  it('cannot be forged from the inscription id alone', () => {
    // The field's scene is served with NO auth, so every insc- id is public.
    // Anything derivable from the id without the secret is derivable by anyone.
    const now = 1_700_000_000_000
    const mine = mintTunnelToken(VECTOR.inscription, VECTOR.secret, { now }).token
    const theirs = mintTunnelToken(VECTOR.inscription, 'a-secret-they-guessed', { now }).token
    expect(theirs).not.toBe(mine)
    // and the signature is genuinely keyed, not a plain hash of the head
    const head = Buffer.from(mine, 'base64url').subarray(0, 21)
    const unkeyed = createHmac('sha256', '').update(head).digest().subarray(0, 16)
    expect(Buffer.from(mine, 'base64url').subarray(21).equals(unkeyed)).toBe(false)
  })

  it('refuses to mint without a secret or for a non-inscription', () => {
    expect(mintTunnelToken(VECTOR.inscription, '')).toBeNull()
    expect(mintTunnelToken('not-an-inscription', VECTOR.secret)).toBeNull()
    expect(mintTunnelToken('', VECTOR.secret)).toBeNull()
  })

  it('builds a telegram deep link, with or without a leading @', () => {
    expect(tunnelUrl('diiii111bot', 'ABC')).toBe('https://t.me/diiii111bot?start=ABC')
    expect(tunnelUrl('@diiii111bot', 'ABC')).toBe('https://t.me/diiii111bot?start=ABC')
  })
})
