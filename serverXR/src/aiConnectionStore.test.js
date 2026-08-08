// @vitest-environment node

import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const store = require('./aiConnectionStore.js')
const { initDb, closeDb, getDb } = require('./db.js')

beforeEach(() => { initDb(':memory:') })
afterEach(() => { closeDb() })

describe('aiConnectionStore', () => {
    it('round-trips a key through encryption', () => {
        store.saveKey('user-1', 'claude', 'sk-ant-api03-secret-key', 'my key')
        expect(store.getKey('user-1', 'claude')).toBe('sk-ant-api03-secret-key')
        const conn = store.getConnection('user-1', 'claude')
        expect(conn.provider).toBe('claude')
        expect(conn.label).toBe('my key')
        expect(conn.last4).toBe('-key')
    })

    it('stores the key encrypted at rest (not plaintext)', () => {
        store.saveKey('user-2', 'claude', 'sk-ant-plaintext-marker')
        const raw = getDb().prepare('SELECT api_key FROM user_ai_connections WHERE user_id = ? AND provider = ?').get('user-2', 'claude')
        expect(raw.api_key).not.toContain('plaintext-marker')
        expect(raw.api_key.split(':')).toHaveLength(3)
    })

    it('upserts: a second save replaces key and label', () => {
        store.saveKey('user-3', 'claude', 'first-key-0001', 'old')
        store.saveKey('user-3', 'claude', 'second-key-0002', 'new')
        expect(store.getKey('user-3', 'claude')).toBe('second-key-0002')
        const conn = store.getConnection('user-3', 'claude')
        expect(conn.label).toBe('new')
        expect(conn.last4).toBe('0002')
        const count = getDb().prepare('SELECT COUNT(*) AS n FROM user_ai_connections WHERE user_id = ?').get('user-3')
        expect(count.n).toBe(1)
    })

    it('deletes a connection', () => {
        store.saveKey('user-4', 'claude', 'sk-gone')
        store.deleteConnection('user-4', 'claude')
        expect(store.getConnection('user-4', 'claude')).toBeNull()
        expect(store.getKey('user-4', 'claude')).toBe('')
    })

    it('a tampered blob decrypts to empty, never garbage', () => {
        store.saveKey('user-5', 'claude', 'sk-authentic')
        const raw = getDb().prepare('SELECT api_key FROM user_ai_connections WHERE user_id = ? AND provider = ?').get('user-5', 'claude')
        const [iv, tag, data] = raw.api_key.split(':')
        const flipped = Buffer.from(data, 'base64')
        flipped[0] = flipped[0] ^ 0xff
        const tampered = `${iv}:${tag}:${flipped.toString('base64')}`
        getDb().prepare('UPDATE user_ai_connections SET api_key = ? WHERE user_id = ? AND provider = ?').run(tampered, 'user-5', 'claude')
        expect(store.getKey('user-5', 'claude')).toBe('')
        expect(store.getConnection('user-5', 'claude').last4).toBe('')
    })
})
