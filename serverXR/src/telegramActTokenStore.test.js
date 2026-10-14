// @vitest-environment node
//
// di.bo act tokens, the storage half. Each assertion names the attack or the
// promise it holds: the token is a key to one person's work, carried by a bot.

import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { initDb, closeDb, getDb } = require('./db.js')
const {
    mintActToken, resolveActToken, revokeActToken, revokeActTokensForUser, pruneActTokens,
    clampTtlMs, PREFIX, DEFAULT_TTL_MS, MAX_TTL_MS, MIN_TTL_MS
} = require('./telegramActTokenStore.js')

const idOf = (token) => token.slice(PREFIX.length).split('.')[0]
const secretOf = (token) => token.slice(PREFIX.length).split('.').slice(1).join('.')

beforeEach(() => { initDb(':memory:') })
afterEach(() => { closeDb() })

describe('telegramActTokenStore', () => {
    it('carries the account it was minted for, and the version it was minted at', () => {
        const { token, id, expiresAt } = mintActToken({ userId: 'u-1', telegramId: '207260649', label: 'Emilya', tokenVersion: 3 })
        expect(token.startsWith(PREFIX)).toBe(true)
        expect(idOf(token)).toBe(id)
        const claim = resolveActToken(token)
        expect(claim).toMatchObject({ tokenId: id, userId: 'u-1', telegramId: '207260649', label: 'Emilya', tokenVersion: 3, expiresAt })
    })

    it('lives 15 minutes by default', () => {
        const now = 1_000_000
        const { expiresAt } = mintActToken({ userId: 'u-1', telegramId: '1', now })
        expect(expiresAt - now).toBe(DEFAULT_TTL_MS)
        expect(DEFAULT_TTL_MS).toBe(15 * 60 * 1000)
    })

    it('can never be minted for longer than an hour, however it is configured', () => {
        expect(clampTtlMs(24 * 60 * 60 * 1000)).toBe(MAX_TTL_MS)
        expect(MAX_TTL_MS).toBe(60 * 60 * 1000)
        expect(clampTtlMs(1)).toBe(MIN_TTL_MS)
        expect(clampTtlMs('nonsense')).toBe(DEFAULT_TTL_MS)
        const now = 1_000_000
        const { expiresAt } = mintActToken({ userId: 'u-1', telegramId: '1', ttlMs: 10 * 60 * 60 * 1000, now })
        expect(expiresAt - now).toBe(MAX_TTL_MS)
    })

    it('is reusable for one errand (several requests) until it expires', () => {
        const { token } = mintActToken({ userId: 'u-1', telegramId: '1' })
        expect(resolveActToken(token)).toBeTruthy()
        expect(resolveActToken(token)).toBeTruthy()
    })

    it('refuses an expired token', () => {
        const { token, expiresAt } = mintActToken({ userId: 'u-1', telegramId: '1' })
        expect(resolveActToken(token, expiresAt - 1)).toBeTruthy()
        expect(resolveActToken(token, expiresAt + 1)).toBeNull()
    })

    it('refuses a revoked token, one by id or all of an account', () => {
        const a = mintActToken({ userId: 'u-1', telegramId: '1' })
        const b = mintActToken({ userId: 'u-1', telegramId: '1' })
        const other = mintActToken({ userId: 'u-2', telegramId: '2' })
        expect(revokeActToken(a.id)).toBe(1)
        expect(resolveActToken(a.token)).toBeNull()
        expect(resolveActToken(b.token)).toBeTruthy()
        expect(revokeActTokensForUser('u-1')).toBe(1)
        expect(resolveActToken(b.token)).toBeNull()
        expect(resolveActToken(other.token), 'revoking one account never touches another').toBeTruthy()
    })

    it('never stores the secret, so a stolen database acts as nobody', () => {
        const { token } = mintActToken({ userId: 'u-1', telegramId: '1' })
        const secret = secretOf(token)
        for (const row of getDb().prepare('SELECT * FROM telegram_act_tokens').all()) {
            expect(JSON.stringify(row)).not.toContain(secret)
        }
    })

    it('refuses a real id with a wrong secret, and anything not shaped like a token', () => {
        const { token } = mintActToken({ userId: 'u-1', telegramId: '1' })
        expect(resolveActToken(`${PREFIX}${idOf(token)}.wrong-secret`)).toBeNull()
        for (const bad of ['', 'nonsense', PREFIX, `${PREFIX}.x`, `${PREFIX}${idOf(token)}.`, 'dii_tglogin_abc.def', `Bearer ${token}`]) {
            expect(resolveActToken(bad), `should refuse ${JSON.stringify(bad)}`).toBeNull()
        }
        // The right secret still works afterwards: probing never burns a key.
        expect(resolveActToken(token)).toBeTruthy()
    })

    it('refuses to mint a token for no account', () => {
        expect(() => mintActToken({ userId: '', telegramId: '1' })).toThrow()
    })

    it('sweeps expired and revoked rows, and keeps live ones', () => {
        const now = Date.now()
        const live = mintActToken({ userId: 'u-1', telegramId: '1', now })
        const old = mintActToken({ userId: 'u-1', telegramId: '1', now: now - 2 * MAX_TTL_MS })
        const revoked = mintActToken({ userId: 'u-1', telegramId: '1', now })
        revokeActToken(revoked.id)
        expect(pruneActTokens(now)).toBe(2)
        const ids = getDb().prepare('SELECT id FROM telegram_act_tokens').all().map((r) => r.id)
        expect(ids).toEqual([live.id])
        expect(old.id).not.toBe(live.id)
    })
})
