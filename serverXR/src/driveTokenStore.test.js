// @vitest-environment node

import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const store = require('./driveTokenStore.js')
const { initDb, closeDb, getDb } = require('./db.js')

beforeEach(() => { initDb(':memory:') })
afterEach(() => { closeDb() })

describe('driveTokenStore', () => {
    it('round-trips tokens through encryption', () => {
        store.saveTokens('user-1', {
            email: 'a@example.com',
            accessToken: 'ya29.access',
            refreshToken: '1//refresh',
            scope: 'drive.readonly',
            expiresAt: 111
        })
        const got = store.getTokens('user-1')
        expect(got.email).toBe('a@example.com')
        expect(got.accessToken).toBe('ya29.access')
        expect(got.refreshToken).toBe('1//refresh')
        expect(got.expiresAt).toBe(111)
        expect(store.isConnected('user-1')).toBe(true)
    })

    it('stores tokens encrypted at rest (not plaintext)', () => {
        store.saveTokens('user-2', { accessToken: 'secret-token', refreshToken: 'secret-refresh' })
        const raw = getDb().prepare('SELECT access_token, refresh_token FROM user_drive_tokens WHERE user_id = ?').get('user-2')
        expect(raw.access_token).not.toContain('secret-token')
        expect(raw.access_token.split(':')).toHaveLength(3)
    })

    it('keeps the existing refresh token when a re-connect omits it', () => {
        store.saveTokens('user-3', { accessToken: 'a1', refreshToken: 'r1' })
        store.saveTokens('user-3', { accessToken: 'a2' }) // Google omits refresh on re-consent
        const got = store.getTokens('user-3')
        expect(got.accessToken).toBe('a2')
        expect(got.refreshToken).toBe('r1')
    })

    it('updateAccessToken swaps the access token but preserves refresh', () => {
        store.saveTokens('user-4', { accessToken: 'a1', refreshToken: 'r1', expiresAt: 1 })
        store.updateAccessToken('user-4', 'a2', 999)
        const got = store.getTokens('user-4')
        expect(got.accessToken).toBe('a2')
        expect(got.refreshToken).toBe('r1')
        expect(got.expiresAt).toBe(999)
    })

    it('deletes tokens', () => {
        store.saveTokens('user-5', { accessToken: 'a' })
        store.deleteTokens('user-5')
        expect(store.getTokens('user-5')).toBeNull()
        expect(store.isConnected('user-5')).toBe(false)
    })
})
