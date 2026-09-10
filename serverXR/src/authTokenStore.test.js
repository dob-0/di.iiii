// @vitest-environment node

import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { initDb, closeDb, getDb } = require('./db.js')
const { mintAuthToken, consumeAuthToken, pruneAuthTokens, KINDS } = require('./authTokenStore.js')

beforeEach(() => { initDb(':memory:') })
afterEach(() => { closeDb() })

describe('authTokenStore', () => {
    it('a minted token works exactly once', () => {
        const { token } = mintAuthToken({ kind: KINDS.RESET, userId: 'u1' })
        expect(consumeAuthToken(token, KINDS.RESET)).toEqual({ userId: 'u1', kind: 'reset' })
        expect(consumeAuthToken(token, KINDS.RESET)).toBe(null)
    })

    it('stores the hash and never the token', () => {
        const { token } = mintAuthToken({ kind: KINDS.MAGIC, userId: 'u1' })
        const rows = getDb().prepare('SELECT * FROM auth_tokens').all()
        const secret = token.split('.')[1]
        expect(rows).toHaveLength(1)
        expect(JSON.stringify(rows)).not.toContain(secret)
    })

    // A verification token spendable as a password reset would turn "I read
    // your mail once, months ago" into "I own your account".
    it('refuses to be spent as a different kind', () => {
        const { token } = mintAuthToken({ kind: KINDS.VERIFY, userId: 'u1' })
        expect(consumeAuthToken(token, KINDS.RESET)).toBe(null)
        // and it is still unspent, because the wrong-kind attempt must not burn it
        expect(consumeAuthToken(token, KINDS.VERIFY)).toEqual({ userId: 'u1', kind: 'verify' })
    })

    it('asking for a new one kills the old one', () => {
        const first = mintAuthToken({ kind: KINDS.RESET, userId: 'u1' })
        const second = mintAuthToken({ kind: KINDS.RESET, userId: 'u1' })
        expect(consumeAuthToken(first.token, KINDS.RESET)).toBe(null)
        expect(consumeAuthToken(second.token, KINDS.RESET)).toEqual({ userId: 'u1', kind: 'reset' })
    })

    it('one person asking does not touch another person, or another kind', () => {
        const mine = mintAuthToken({ kind: KINDS.RESET, userId: 'u1' })
        const myVerify = mintAuthToken({ kind: KINDS.VERIFY, userId: 'u1' })
        mintAuthToken({ kind: KINDS.RESET, userId: 'u2' })
        // Scoped to (person, kind): somebody ELSE asking for a reset, or me
        // asking for a different kind, must leave my live reset alone.
        expect(consumeAuthToken(mine.token, KINDS.RESET)).toEqual({ userId: 'u1', kind: 'reset' })
        expect(consumeAuthToken(myVerify.token, KINDS.VERIFY)).toEqual({ userId: 'u1', kind: 'verify' })
    })

    it('expires', () => {
        const { token } = mintAuthToken({ kind: KINDS.MAGIC, userId: 'u1', ttlMs: 60 * 1000 })
        getDb().prepare('UPDATE auth_tokens SET expires_at = ?').run(Date.now() - 1)
        expect(consumeAuthToken(token, KINDS.MAGIC)).toBe(null)
    })

    // Unknown, forged, malformed and empty must be one answer, not four.
    it('answers null for everything that is not a live token', () => {
        const { token } = mintAuthToken({ kind: KINDS.MAGIC, userId: 'u1' })
        const [head, secret] = token.split('.')
        for (const junk of ['', 'nonsense', 'dii_auth_', 'dii_auth_.x', `${head}.`, `${head}.wrong-secret`,
            `dii_auth_deadbeefdeadbeef.${secret}`, null, undefined]) {
            expect(consumeAuthToken(junk, KINDS.MAGIC)).toBe(null)
        }
        // none of that spent the real one
        expect(consumeAuthToken(token, KINDS.MAGIC)).toEqual({ userId: 'u1', kind: 'magic' })
    })

    it('refuses to mint for a kind it does not know', () => {
        expect(mintAuthToken({ kind: 'admin', userId: 'u1' })).toBe(null)
        expect(mintAuthToken({ kind: KINDS.RESET, userId: '' })).toBe(null)
    })

    it('prunes what is spent or stale, and keeps what is live', () => {
        const live = mintAuthToken({ kind: KINDS.VERIFY, userId: 'u1' })
        const spent = mintAuthToken({ kind: KINDS.RESET, userId: 'u2' })
        consumeAuthToken(spent.token, KINDS.RESET)
        expect(pruneAuthTokens()).toBe(1)
        expect(consumeAuthToken(live.token, KINDS.VERIFY)).toEqual({ userId: 'u1', kind: 'verify' })
    })
})
