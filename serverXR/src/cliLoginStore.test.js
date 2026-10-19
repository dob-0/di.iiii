// @vitest-environment node
//
// Signing in from a terminal, the storage half (docs/architecture/CLI_LOGIN.md). Each assertion names the attack or the promise it
// holds: the device code is the secret a terminal keeps, the user code is what a person types, the token is a key to one
// person's work that sits in a file on a laptop.

import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const crypto = require('node:crypto')
const { initDb, closeDb, getDb } = require('./db.js')
const store = require('./cliLoginStore.js')
const {
    startDeviceLogin, describePending, decide, exchangeDeviceCode, mintCliToken, resolveCliToken, listCliTokens,
    revokeCliToken, revokeCliTokensForUser, pruneCliLogin, normalizeUserCode, cleanLabel,
    TOKEN_PREFIX, USER_CODE_ALPHABET, DEVICE_TTL_MS, INTERVAL_MS, TOKEN_IDLE_MS, TOKEN_MAX_MS, TOUCH_EVERY_MS, MAX_LIVE_DEVICE_CODES
} = store

const T0 = 1_700_000_000_000
const sha = (value) => crypto.createHash('sha256').update(String(value)).digest('hex')
const idOf = (token) => token.slice(TOKEN_PREFIX.length).split('.')[0]
const secretOf = (token) => token.slice(TOKEN_PREFIX.length).split('.').slice(1).join('.')

beforeEach(() => { initDb(':memory:') })
afterEach(() => { vi.restoreAllMocks(); closeDb() })

describe('a terminal asking to be signed in', () => {
    it('is given a secret it keeps and a short code a person types, with the life and pace the doc states', () => {
        const started = startDeviceLogin({ label: 'taron-laptop (di 0.4.17)', from: '203.0.x.x', now: T0 })
        expect(started.deviceCode.length).toBeGreaterThanOrEqual(43) // 32 random bytes, base64url
        expect(started.userCode).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$/)
        expect(started.expiresIn).toBe(600)
        expect(started.interval).toBe(5)
        expect(DEVICE_TTL_MS).toBe(10 * 60 * 1000)
        expect(INTERVAL_MS).toBe(5000)
    })

    it('uses 20 symbols with no vowel, so a code never spells a word', () => {
        expect(USER_CODE_ALPHABET).toHaveLength(20)
        expect(USER_CODE_ALPHABET).not.toMatch(/[AEIOUY01]/)
        for (let i = 0; i < 200; i += 1) {
            const { userCode } = startDeviceLogin({ now: T0 + i })
            expect(userCode.replace('-', '')).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{8}$/)
        }
    })

    it('keeps neither code in the clear — only their hashes are in the table', () => {
        const { deviceCode, userCode } = startDeviceLogin({ label: 'x', now: T0 })
        const dump = JSON.stringify(getDb().prepare('SELECT * FROM cli_device_codes').all())
        expect(dump).not.toContain(deviceCode)
        expect(dump).not.toContain(userCode)
        expect(dump).not.toContain(userCode.replace('-', ''))
    })

    it('never gives two live terminals the same user code', () => {
        // Force the random source to hand out the same code twice, then a different one.
        const spy = vi.spyOn(crypto, 'randomInt')
        let calls = 0
        spy.mockImplementation(() => { calls += 1; return calls <= 16 ? 0 : (calls % 19) + 1 })
        const a = startDeviceLogin({ now: T0 })
        const b = startDeviceLogin({ now: T0 })
        expect(a.userCode).toBe('BBBB-BBBB')
        expect(b.userCode).not.toBe(a.userCode)
        expect(decide({ userCode: b.userCode, userId: 'u', approve: true, now: T0 })).toEqual({ approved: true })
        expect(exchangeDeviceCode({ deviceCode: a.deviceCode, now: T0 }).status).toBe('pending') // b's answer did not reach a
    })

    it('refuses to start more codes than it will hold, whoever asks', () => {
        const insert = getDb().prepare(`INSERT INTO cli_device_codes (id, device_hash, user_code_hash, status, interval_ms, created_at, expires_at)
            VALUES (?, ?, ?, 'pending', 5000, ?, ?)`)
        for (let i = 0; i < MAX_LIVE_DEVICE_CODES; i += 1) insert.run(`id${i}`, `d${i}`, `u${i}`, T0, T0 + DEVICE_TTL_MS)
        expect(() => startDeviceLogin({ now: T0 })).toThrow(/Too many/)
        // …and codes that have ended do not count against the limit.
        expect(startDeviceLogin({ now: T0 + DEVICE_TTL_MS + 1 }).userCode).toBeTruthy()
    })

    it('treats the label as text a machine chose: control and direction marks removed, 80 characters at most', () => {
        expect(cleanLabel('a\u0000b\u202ec\u2066d\u200be\nf')).toBe('a b c d e f')
        expect(cleanLabel('x'.repeat(300))).toHaveLength(80)
        expect(cleanLabel('   ')).toBeNull()
        expect(cleanLabel(null)).toBeNull()
        const { userCode } = startDeviceLogin({ label: 'evil\u202e', now: T0 })
        expect(describePending(userCode, T0).label).toBe('evil')
    })
})

describe('what a person types', () => {
    it('is read without regard to case, dash or spaces, and refused when it cannot be a code', () => {
        expect(normalizeUserCode('bdfg-hjkl')).toBe('BDFGHJKL')
        expect(normalizeUserCode(' BDFG HJKL ')).toBe('BDFGHJKL')
        expect(normalizeUserCode('BDFGHJKL')).toBe('BDFGHJKL')
        expect(normalizeUserCode('BDFG-HJK')).toBeNull()
        expect(normalizeUserCode('BDFG-HJKA')).toBeNull() // a vowel is not in the alphabet
        expect(normalizeUserCode('')).toBeNull()
        expect(normalizeUserCode(undefined)).toBeNull()
        expect(normalizeUserCode({ toString() { return 'BDFGHJKL' } })).toBe('BDFGHJKL')
    })

    it('shows the page only what the machine said about itself — never a code', () => {
        const { userCode, deviceCode } = startDeviceLogin({ label: 'taron-laptop', from: '203.0.x.x', now: T0 })
        const seen = describePending(userCode.toLowerCase(), T0 + 1000)
        expect(seen).toEqual({ label: 'taron-laptop', requestedAt: T0, expiresAt: T0 + DEVICE_TTL_MS, from: '203.0.x.x' })
        expect(JSON.stringify(seen)).not.toContain(deviceCode)
        expect(describePending('BBBB-BBBB', T0)).toBeNull()
        expect(describePending(userCode, T0 + DEVICE_TTL_MS + 1)).toBeNull()
    })
})

describe('the person\'s answer', () => {
    it('approves once, and only while the code is live', () => {
        const { userCode, deviceCode } = startDeviceLogin({ now: T0 })
        expect(decide({ userCode, userId: 'u-1', approve: true, now: T0 + 1000 })).toEqual({ approved: true })
        expect(decide({ userCode, userId: 'u-2', approve: true, now: T0 + 2000 })).toBeNull() // already decided: a second person cannot take it over
        expect(exchangeDeviceCode({ deviceCode, now: T0 + 6000 })).toMatchObject({ status: 'approved', userId: 'u-1' })
    })

    it('answers null — the same — for a wrong, an expired and an already decided code', () => {
        const { userCode } = startDeviceLogin({ now: T0 })
        expect(decide({ userCode: 'BBBB-BBBB', userId: 'u', approve: true, now: T0 })).toBeNull()
        expect(decide({ userCode, userId: 'u', approve: true, now: T0 + DEVICE_TTL_MS + 1 })).toBeNull()
        expect(decide({ userCode, userId: '', approve: true, now: T0 })).toBeNull() // nobody is not a person
        expect(decide({ userCode, userId: 'u', approve: false, now: T0 })).toEqual({ approved: false })
        expect(decide({ userCode, userId: 'u', approve: true, now: T0 })).toBeNull()
    })
})

describe('the terminal\'s poll', () => {
    it('hears "pending" until the person answers, then gets the token exactly once', () => {
        const { deviceCode, userCode } = startDeviceLogin({ label: 'laptop', from: '1.2.x.x', now: T0 })
        expect(exchangeDeviceCode({ deviceCode, now: T0 })).toEqual({ status: 'pending' })
        expect(exchangeDeviceCode({ deviceCode, now: T0 + 5000 })).toEqual({ status: 'pending' })
        decide({ userCode, userId: 'u-1', approve: true, now: T0 + 6000 })
        const got = exchangeDeviceCode({ deviceCode, now: T0 + 10_000 })
        expect(got.status).toBe('approved')
        expect(got.token.startsWith(TOKEN_PREFIX)).toBe(true)
        expect(got.userId).toBe('u-1')
        expect(got.expiresAt).toBe(T0 + 10_000 + TOKEN_IDLE_MS)
        // spent: the same poll again, and every poll after, learns nothing
        expect(exchangeDeviceCode({ deviceCode, now: T0 + 15_000 })).toEqual({ status: 'expired' })
        expect(resolveCliToken(got.token, T0 + 20_000)).toMatchObject({ userId: 'u-1', label: 'laptop' })
    })

    it('tells a terminal that polls too fast to slow down, and keeps asking for the slower pace', () => {
        const { deviceCode } = startDeviceLogin({ now: T0 })
        expect(exchangeDeviceCode({ deviceCode, now: T0 })).toEqual({ status: 'pending' })
        expect(exchangeDeviceCode({ deviceCode, now: T0 + 1000 })).toEqual({ status: 'slow_down', interval: 10 })
        expect(exchangeDeviceCode({ deviceCode, now: T0 + 6000 })).toEqual({ status: 'slow_down', interval: 15 }) // 5 s is no longer enough
        expect(exchangeDeviceCode({ deviceCode, now: T0 + 6000 + 15_000 })).toEqual({ status: 'pending' })
    })

    it('does not call a poll a second early "too fast" (timers drift)', () => {
        const { deviceCode } = startDeviceLogin({ now: T0 })
        exchangeDeviceCode({ deviceCode, now: T0 })
        expect(exchangeDeviceCode({ deviceCode, now: T0 + 4100 }).status).toBe('pending')
    })

    it('says "denied" once when the person says no, and no token exists afterwards', () => {
        const { deviceCode, userCode } = startDeviceLogin({ now: T0 })
        decide({ userCode, userId: 'u-1', approve: false, now: T0 + 100 })
        expect(exchangeDeviceCode({ deviceCode, now: T0 + 5000 })).toEqual({ status: 'denied' })
        expect(exchangeDeviceCode({ deviceCode, now: T0 + 10_000 })).toEqual({ status: 'expired' })
        expect(getDb().prepare('SELECT COUNT(*) AS n FROM cli_tokens').get().n).toBe(0)
    })

    it('says "expired" for an unknown code, a spent one, and one past its ten minutes — alike', () => {
        const { deviceCode } = startDeviceLogin({ now: T0 })
        expect(exchangeDeviceCode({ deviceCode: 'nonsense', now: T0 })).toEqual({ status: 'expired' })
        expect(exchangeDeviceCode({ deviceCode: '', now: T0 })).toEqual({ status: 'expired' })
        expect(exchangeDeviceCode({ deviceCode: 'x'.repeat(5000), now: T0 })).toEqual({ status: 'expired' })
        expect(exchangeDeviceCode({ deviceCode, now: T0 + DEVICE_TTL_MS + 1 })).toEqual({ status: 'expired' })
    })

    it('cannot be answered twice by two polls that race: the loser gets nothing', () => {
        const { deviceCode, userCode } = startDeviceLogin({ now: T0 })
        decide({ userCode, userId: 'u-1', approve: true, now: T0 })
        // The poll reads the row as approved; before it can spend the code, another
        // poll (another process on the same database) spends it first.
        const db = getDb()
        const real = db.prepare.bind(db)
        let raced = false
        vi.spyOn(db, 'prepare').mockImplementation((sql) => {
            const statement = real(sql)
            if (!raced && /SET status = 'consumed'/.test(sql)) {
                raced = true
                real("UPDATE cli_device_codes SET status = 'consumed'").run()
            }
            return statement
        })
        expect(exchangeDeviceCode({ deviceCode, now: T0 + 1000 })).toEqual({ status: 'expired' })
        expect(db.prepare('SELECT COUNT(*) AS n FROM cli_tokens').get().n).toBe(0)
    })

    it('does not issue to an account that can no longer be signed in', () => {
        const { deviceCode, userCode } = startDeviceLogin({ now: T0 })
        decide({ userCode, userId: 'blocked-1', approve: true, now: T0 })
        expect(exchangeDeviceCode({ deviceCode, canIssueFor: () => false, now: T0 + 1000 })).toEqual({ status: 'denied' })
        expect(getDb().prepare('SELECT COUNT(*) AS n FROM cli_tokens').get().n).toBe(0)
    })
})

describe('a terminal token', () => {
    it('carries the account it was made for, and keeps only a hash of its secret', () => {
        const { token, id, expiresAt } = mintCliToken({ userId: 'u-1', label: 'taron-laptop', now: T0 })
        expect(token.startsWith('dii_cli_')).toBe(true)
        expect(idOf(token)).toBe(id)
        expect(expiresAt).toBe(T0 + 90 * 24 * 60 * 60 * 1000)
        expect(resolveCliToken(token, T0 + 1000)).toMatchObject({ tokenId: id, userId: 'u-1', label: 'taron-laptop' })
        const row = getDb().prepare('SELECT * FROM cli_tokens WHERE id = ?').get(id)
        expect(row.secret_hash).toBe(sha(secretOf(token)))
        expect(JSON.stringify(row)).not.toContain(secretOf(token))
    })

    it('refuses what is not exactly the token — and says the same for every kind of wrong', () => {
        const { token, id } = mintCliToken({ userId: 'u-1', now: T0 })
        const secret = secretOf(token)
        for (const bad of [
            '', null, undefined, 'dii_cli_', 'dii_cli_.', `dii_cli_${id}`, `dii_cli_${id}.`, `dii_cli_${id}.${secret}x`,
            `dii_cli_${id}.${secret.slice(0, -1)}`, `dii_cli_0000000000000000.${secret}`, `dii_sync_${id}.${secret}`, `dii_tgact_${id}.${secret}`, secret
        ]) expect(resolveCliToken(bad, T0 + 1)).toBeNull()
    })

    it('ends 90 days after it was last used, and an active person is not asked again', () => {
        const { token } = mintCliToken({ userId: 'u-1', now: T0 })
        const day = 24 * 60 * 60 * 1000
        expect(resolveCliToken(token, T0 + 89 * day)).toBeTruthy()      // used on day 89 …
        expect(resolveCliToken(token, T0 + 170 * day)).toBeTruthy()     // … so it lives to day 179
        expect(resolveCliToken(token, T0 + 170 * day + 91 * day)).toBeNull() // unused for 91 days: gone
    })

    it('never lasts past 365 days since it was made, however often it is used', () => {
        const { token } = mintCliToken({ userId: 'u-1', now: T0 })
        const day = 24 * 60 * 60 * 1000
        let now = T0
        let last = null
        while (now < T0 + 400 * day) {
            now += 60 * day
            last = resolveCliToken(token, now)
            if (!last) break
            expect(last.expiresAt).toBeLessThanOrEqual(T0 + TOKEN_MAX_MS)
        }
        expect(resolveCliToken(token, T0 + TOKEN_MAX_MS + 1)).toBeNull()
    })

    it('moves its expiry at most once in ten minutes, not on every request', () => {
        const { token, id } = mintCliToken({ userId: 'u-1', now: T0 })
        const expiry = () => getDb().prepare('SELECT expires_at FROM cli_tokens WHERE id = ?').get(id).expires_at
        const before = expiry()
        resolveCliToken(token, T0 + TOUCH_EVERY_MS - 1)
        expect(expiry()).toBe(before)
        resolveCliToken(token, T0 + TOUCH_EVERY_MS)
        expect(expiry()).toBe(T0 + TOUCH_EVERY_MS + TOKEN_IDLE_MS)
    })

    it('is ended by revoking it — by the account that owns it, or by the terminal that holds it', () => {
        const mine = mintCliToken({ userId: 'u-1', now: T0 })
        const theirs = mintCliToken({ userId: 'u-2', now: T0 })
        expect(revokeCliToken({ id: mine.id, userId: 'u-2', now: T0 + 1 })).toBe(0) // not u-2's to end
        expect(resolveCliToken(mine.token, T0 + 2)).toBeTruthy()
        expect(revokeCliToken({ id: mine.id, userId: 'u-1', now: T0 + 3 })).toBe(1)
        expect(resolveCliToken(mine.token, T0 + 4)).toBeNull()
        expect(revokeCliToken({ id: mine.id, userId: 'u-1', now: T0 + 5 })).toBe(0) // already ended
        expect(revokeCliToken({ id: theirs.id, now: T0 + 6 })).toBe(1) // the terminal ending itself
        expect(resolveCliToken(theirs.token, T0 + 7)).toBeNull()
        expect(revokeCliToken({ id: undefined, now: T0 })).toBe(0)
    })

    it('can all be ended for one account at once, and only that account', () => {
        const a = mintCliToken({ userId: 'u-1', now: T0 })
        const b = mintCliToken({ userId: 'u-1', now: T0 })
        const c = mintCliToken({ userId: 'u-2', now: T0 })
        expect(revokeCliTokensForUser('u-1', T0 + 1)).toBe(2)
        expect(resolveCliToken(a.token, T0 + 2)).toBeNull()
        expect(resolveCliToken(b.token, T0 + 2)).toBeNull()
        expect(resolveCliToken(c.token, T0 + 2)).toBeTruthy()
    })

    it('is listed for its own account — live ones only, never a secret', () => {
        const a = mintCliToken({ userId: 'u-1', label: 'laptop', from: '1.2.x.x', now: T0 })
        const b = mintCliToken({ userId: 'u-1', label: 'desktop', now: T0 + 1000 })
        mintCliToken({ userId: 'u-2', label: 'someone else', now: T0 })
        revokeCliToken({ id: a.id, now: T0 + 2000 })
        const list = listCliTokens('u-1', T0 + 3000)
        expect(list.map((row) => row.id)).toEqual([b.id])
        expect(list[0]).toEqual({ id: b.id, label: 'desktop', createdAt: T0 + 1000, lastUsedAt: T0 + 1000, expiresAt: T0 + 1000 + TOKEN_IDLE_MS })
        expect(JSON.stringify(list)).not.toContain('dii_cli_')
        expect(listCliTokens('u-1', T0 + 1000 + TOKEN_IDLE_MS + 1)).toEqual([])
    })

    it('does not end when the account\'s browser sessions do — it has no token_version', () => {
        // The promise in the doc: a browser sign-out bumps users.token_version and ends every cookie; a terminal login must survive it.
        const { token } = mintCliToken({ userId: 'u-1', now: T0 })
        const columns = getDb().prepare('PRAGMA table_info(cli_tokens)').all().map((c) => c.name)
        expect(columns).not.toContain('token_version')
        expect(resolveCliToken(token, T0 + 1000)).toBeTruthy()
    })

    it('is swept when ended, and the sweep leaves the live ones', () => {
        const live = mintCliToken({ userId: 'u-1', now: T0 })
        const ended = mintCliToken({ userId: 'u-1', now: T0 })
        revokeCliToken({ id: ended.id, now: T0 + 1 })
        const { deviceCode } = startDeviceLogin({ now: T0 })
        expect(pruneCliLogin(T0 + 2)).toBe(1) // the revoked token; the device code is still live
        expect(pruneCliLogin(T0 + DEVICE_TTL_MS + 60 * 60 * 1000 + 1)).toBe(1) // an hour after the code ended
        expect(exchangeDeviceCode({ deviceCode, now: T0 + DEVICE_TTL_MS + 60 * 60 * 1000 + 2 }).status).toBe('expired')
        expect(resolveCliToken(live.token, T0 + 3)).toBeTruthy()
    })
})
