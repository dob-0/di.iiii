// @vitest-environment node
//
// Telegram sign-in tokens. These assertions ARE the feature's security
// argument, so each one names the attack it refuses rather than the method it
// calls: the link travels through a chat, and a chat message can be forwarded,
// screenshotted, and backed up to somebody else's cloud.

import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { initDb, closeDb, getDb } = require('./db.js')
const { mintLoginToken, consumeLoginToken, pruneLoginTokens, PREFIX } = require('./telegramLoginStore.js')

const secretOf = (token) => token.slice(PREFIX.length).split('.').slice(1).join('.')
const idOf = (token) => token.slice(PREFIX.length).split('.')[0]

beforeEach(() => { initDb(':memory:') })
afterEach(() => { closeDb() })

describe('telegramLoginStore', () => {
    it('carries the person it was minted for', () => {
        const { token } = mintLoginToken({ telegramId: '207260649', displayName: 'A Person' })
        expect(token.startsWith(PREFIX)).toBe(true)
        const claim = consumeLoginToken(token)
        expect(claim.telegramId).toBe('207260649')
        expect(claim.displayName).toBe('A Person')
    })

    it('makes a forwarded link worthless once the first person opens it', () => {
        const { token } = mintLoginToken({ telegramId: '111' })
        expect(consumeLoginToken(token)).toBeTruthy()
        expect(consumeLoginToken(token)).toBeNull()
    })

    it('gives the row to exactly one of two opens racing', () => {
        const { token } = mintLoginToken({ telegramId: '222' })
        const results = [consumeLoginToken(token), consumeLoginToken(token)]
        expect(results.filter(Boolean)).toHaveLength(1)
    })

    it('refuses an expired link', () => {
        const { token } = mintLoginToken({ telegramId: '333' })
        getDb().prepare('UPDATE telegram_login_tokens SET expires_at = ? WHERE id = ?')
            .run(Date.now() - 1000, idOf(token))
        expect(consumeLoginToken(token)).toBeNull()
    })

    it('never stores the secret, so a stolen database mints nothing', () => {
        const { token } = mintLoginToken({ telegramId: '444' })
        const secret = secretOf(token)
        for (const row of getDb().prepare('SELECT * FROM telegram_login_tokens').all()) {
            expect(JSON.stringify(row)).not.toContain(secret)
        }
    })

    it('refuses a real id with a wrong secret WITHOUT spending the token', () => {
        // Otherwise anyone who can guess an id locks the real person out by
        // burning their link.
        const { token } = mintLoginToken({ telegramId: '555' })
        expect(consumeLoginToken(`${PREFIX}${idOf(token)}.not-the-secret`)).toBeNull()
        expect(consumeLoginToken(token)).toBeTruthy()
    })

    it('refuses garbage without throwing', () => {
        for (const bad of ['', null, undefined, 'nope', PREFIX, `${PREFIX}.`, `${PREFIX}abc`, 'dii_invite_x.y']) {
            expect(consumeLoginToken(bad)).toBeNull()
        }
    })

    it('gives two people minted at once different tokens', () => {
        const a = mintLoginToken({ telegramId: '1' })
        const b = mintLoginToken({ telegramId: '2' })
        expect(a.token).not.toBe(b.token)
        expect(consumeLoginToken(a.token).telegramId).toBe('1')
        expect(consumeLoginToken(b.token).telegramId).toBe('2')
    })

    it('carries an avatar only when one was minted', () => {
        const withAvatar = mintLoginToken({ telegramId: '666', avatarUrl: 'https://cdn.telegram.org/x.jpg' })
        expect(consumeLoginToken(withAvatar.token).avatarUrl).toBe('https://cdn.telegram.org/x.jpg')
        const bare = mintLoginToken({ telegramId: '777' })
        expect(consumeLoginToken(bare.token).avatarUrl).toBeNull()
    })

    it('clears spent and expired rows and keeps live ones', () => {
        const live = mintLoginToken({ telegramId: '888' })
        const spent = mintLoginToken({ telegramId: '999' })
        consumeLoginToken(spent.token)
        expect(pruneLoginTokens()).toBeGreaterThanOrEqual(1)
        expect(getDb().prepare('SELECT COUNT(*) c FROM telegram_login_tokens').get().c).toBe(1)
        expect(consumeLoginToken(live.token)).toBeTruthy()
    })

    it('never mints a link that outlives a workshop break', () => {
        // A minimum floor exists so a caller cannot ask for a zero-second
        // token, but the ceiling is what matters: this link is not a session.
        const { expiresAt } = mintLoginToken({ telegramId: '1234' })
        expect(expiresAt - Date.now()).toBeLessThanOrEqual(10 * 60 * 1000)
    })
})
