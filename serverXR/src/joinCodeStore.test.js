// @vitest-environment node

import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createSpaceStore } = require('./spaceStore.js')
const { initDb, closeDb, getDb } = require('./db.js')
const { resolveSyncKey, listSyncKeys, revokeSyncKey } = require('./syncKeyStore.js')
const { WORDS, REMOVED } = require('./joinCodeWords.js')
const {
    CODE_TTL_MS, normaliseCode, formatCode, issueJoinCode, peekJoinCode, redeemJoinCode,
    liveJoinCode, revokeJoinCode, createAttemptLimiter
} = require('./joinCodeStore.js')

const tempDirs = []
const makeSpace = async (id) => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'dii-joincode-'))
    tempDirs.push(dir)
    const store = createSpaceStore({ spacesDir: dir, blankScene: { objects: [] } })
    await store.saveSpaceMeta(id, store.buildMeta(id, { ownerUserId: 'owner-1' }))
}

beforeEach(() => { initDb(':memory:') })
afterEach(async () => {
    closeDb()
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

const T0 = 1_800_000_000_000

describe('the word list', () => {
    it('is unique, plain lower-case a-z, at least 40 bits for four words, and leaves out what it says it removed', () => {
        expect(new Set(WORDS).size).toBe(WORDS.length)
        expect(WORDS.every((word) => /^[a-z]{3,5}$/.test(word))).toBe(true)
        expect(4 * Math.log2(WORDS.length)).toBeGreaterThan(40)
        for (const removed of REMOVED) expect(WORDS).not.toContain(removed)
    })
})

describe('typing a code', () => {
    it('reads the middle dots the host shows, spaces, commas, dashes and any case', () => {
        const [a, b, c, d] = WORDS.slice(10, 14)
        const expected = [a, b, c, d]
        expect(normaliseCode(`${a.toUpperCase()} · ${b.toUpperCase()} · ${c.toUpperCase()} · ${d.toUpperCase()}`)).toEqual(expected)
        expect(normaliseCode(`${a}, ${b}-${c}   ${d}`)).toEqual(expected)
        expect(normaliseCode(expected)).toEqual(expected)
    })

    it('refuses anything that is not four words from the list', () => {
        const [a, b, c, d] = WORDS
        expect(normaliseCode('')).toBeNull()
        expect(normaliseCode(null)).toBeNull()
        expect(normaliseCode(`${a} ${b} ${c}`)).toBeNull()
        expect(normaliseCode(`${a} ${b} ${c} ${d} ${a}`)).toBeNull()
        expect(normaliseCode(`${a} ${b} ${c} zzzzz`)).toBeNull()
        // A removed word is not on the list, so it cannot be typed into a match.
        expect(normaliseCode(`${a} ${b} ${c} ${REMOVED[0]}`)).toBeNull()
    })

    it('shows the four words the way the sketch writes them', () => {
        expect(formatCode(['amber', 'desk', 'nine', 'river'])).toBe('AMBER · DESK · NINE · RIVER')
    })
})

describe('issuing a code', () => {
    it('makes four words that are valid for exactly ten minutes', async () => {
        await makeSpace('moxir')
        const issued = issueJoinCode({ spaceId: 'moxir', ownerUserId: 'owner-1', now: T0 })
        expect(issued.words).toHaveLength(4)
        expect(issued.words.every((word) => WORDS.includes(word))).toBe(true)
        expect(issued.expiresAt - T0).toBe(CODE_TTL_MS)
        expect(CODE_TTL_MS).toBe(10 * 60 * 1000)

        expect(peekJoinCode(issued.words, { now: T0 + 1000 })).toMatchObject({ spaceId: 'moxir' })
        expect(peekJoinCode(issued.words, { now: T0 + CODE_TTL_MS - 1 })).not.toBeNull()
        // Expired: the same words, one millisecond on.
        expect(peekJoinCode(issued.words, { now: T0 + CODE_TTL_MS })).toBeNull()
    })

    it('stores a hash of the words and no key — nothing in the database can be typed or replayed', async () => {
        await makeSpace('moxir')
        const issued = issueJoinCode({ spaceId: 'moxir', now: T0 })
        const rows = getDb().prepare('SELECT * FROM space_join_codes').all()
        expect(rows).toHaveLength(1)
        const dump = JSON.stringify(rows)
        for (const word of issued.words) expect(dump).not.toContain(word)
        expect(dump).not.toContain('dii_sync_')
        expect(rows[0].code_hash).toMatch(/^[0-9a-f]{64}$/)
        expect(rows[0].key_id).toBeNull()
        // And a code that was never redeemed never became a credential.
        expect(listSyncKeys('moxir')).toHaveLength(0)
    })

    it('keeps one live code per space: a new one revokes the unused old one', async () => {
        await makeSpace('moxir')
        const first = issueJoinCode({ spaceId: 'moxir', now: T0 })
        const second = issueJoinCode({ spaceId: 'moxir', now: T0 + 1000 })
        expect(peekJoinCode(first.words, { now: T0 + 2000 })).toBeNull()
        expect(peekJoinCode(second.words, { now: T0 + 2000 })).not.toBeNull()
        expect(liveJoinCode('moxir', { now: T0 + 2000 })).toMatchObject({ id: second.id })
    })

    it('draws again when the same four words are already on file', async () => {
        await makeSpace('moxir')
        await makeSpace('other')
        const fixed = [WORDS[1], WORDS[2], WORDS[3], WORDS[4]]
        let calls = 0
        const rigged = () => {
            calls += 1
            // the first four draws are the first code; the next four repeat it; then it moves on
            const n = calls <= 8 ? fixed[(calls - 1) % 4] : WORDS[calls]
            return WORDS.indexOf(n)
        }
        const first = issueJoinCode({ spaceId: 'moxir', now: T0, randomInt: rigged })
        const second = issueJoinCode({ spaceId: 'other', now: T0, randomInt: rigged })
        expect(first.words).toEqual(fixed)
        expect(second.words).not.toEqual(fixed)
    })
})

describe('redeeming a code', () => {
    it('hands over a real sync key for that one space, once', async () => {
        await makeSpace('moxir')
        const issued = issueJoinCode({ spaceId: 'moxir', ownerUserId: 'owner-1', now: T0 })
        const got = redeemJoinCode(issued.words, { now: T0 + 5000, machineName: 'ponyo' })
        expect(got.spaceId).toBe('moxir')
        expect(got.token.startsWith('dii_sync_')).toBe(true)
        // It is the existing key: the server's own resolver accepts it, scoped to the space.
        expect(resolveSyncKey(got.token)).toMatchObject({ spaceId: 'moxir', keyId: got.keyId, label: 'follow · ponyo' })
        // It is recorded on the code, so a used code points at the key it became.
        expect(getDb().prepare('SELECT key_id, used_at FROM space_join_codes').get()).toMatchObject({ key_id: got.keyId, used_at: T0 + 5000 })
    })

    it('works once: the second try with the same words is refused', async () => {
        await makeSpace('moxir')
        const issued = issueJoinCode({ spaceId: 'moxir', now: T0 })
        expect(redeemJoinCode(issued.words, { now: T0 + 1 })).not.toBeNull()
        expect(redeemJoinCode(issued.words, { now: T0 + 2 })).toBeNull()
        expect(peekJoinCode(issued.words, { now: T0 + 2 })).toBeNull()
        expect(listSyncKeys('moxir')).toHaveLength(1)
    })

    it('is refused after ten minutes, and mints nothing', async () => {
        await makeSpace('moxir')
        const issued = issueJoinCode({ spaceId: 'moxir', now: T0 })
        expect(redeemJoinCode(issued.words, { now: T0 + CODE_TTL_MS + 1 })).toBeNull()
        expect(listSyncKeys('moxir')).toHaveLength(0)
    })

    it('is refused once revoked, and a used code cannot be revoked as a code', async () => {
        await makeSpace('moxir')
        const issued = issueJoinCode({ spaceId: 'moxir', now: T0 })
        expect(revokeJoinCode('some-other-space', issued.id)).toBe(false)
        expect(revokeJoinCode('moxir', issued.id)).toBe(true)
        expect(redeemJoinCode(issued.words, { now: T0 + 1 })).toBeNull()

        const second = issueJoinCode({ spaceId: 'moxir', now: T0 + 10 })
        redeemJoinCode(second.words, { now: T0 + 11 })
        expect(revokeJoinCode('moxir', second.id)).toBe(false)
    })

    it('after redeeming, the key it became is revoked through the existing sync-key path', async () => {
        await makeSpace('moxir')
        const issued = issueJoinCode({ spaceId: 'moxir', now: T0 })
        const got = redeemJoinCode(issued.words, { now: T0 + 1 })
        expect(revokeSyncKey('moxir', got.keyId)).toBe(true)
        expect(resolveSyncKey(got.token)).toBeNull()
    })

    it('answers the same for wrong words, a typo, and nothing at all', async () => {
        await makeSpace('moxir')
        issueJoinCode({ spaceId: 'moxir', now: T0 })
        expect(redeemJoinCode([WORDS[0], WORDS[1], WORDS[2], WORDS[3]], { now: T0 + 1 })).toBeNull()
        expect(redeemJoinCode('amber desk nine rivr', { now: T0 + 1 })).toBeNull()
        expect(redeemJoinCode(undefined, { now: T0 + 1 })).toBeNull()
        expect(listSyncKeys('moxir')).toHaveLength(0)
    })

    it('two joiners at once cannot both win', async () => {
        await makeSpace('moxir')
        const issued = issueJoinCode({ spaceId: 'moxir', now: T0 })
        const results = [redeemJoinCode(issued.words, { now: T0 + 1 }), redeemJoinCode(issued.words, { now: T0 + 1 })]
        expect(results.filter(Boolean)).toHaveLength(1)
        expect(listSyncKeys('moxir')).toHaveLength(1)
    })
})

describe('counting wrong guesses', () => {
    it('stops one client after its allowance, for the rest of the window, and lets it back in after', () => {
        let at = T0
        const limiter = createAttemptLimiter({ perClient: 3, overall: 100, windowMs: 60_000, now: () => at })
        for (let i = 0; i < 3; i += 1) {
            expect(limiter.check('a').ok).toBe(true)
            limiter.fail('a')
        }
        const blocked = limiter.check('a')
        expect(blocked.ok).toBe(false)
        expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
        expect(limiter.check('b').ok).toBe(true)
        at += 61_000
        expect(limiter.check('a').ok).toBe(true)
    })

    it('stops everyone once the whole room has guessed wrong too often (a guesser with many addresses)', () => {
        const limiter = createAttemptLimiter({ perClient: 100, overall: 4, windowMs: 60_000, now: () => T0 })
        for (let i = 0; i < 4; i += 1) limiter.fail(`client-${i}`)
        expect(limiter.check('a-new-client').ok).toBe(false)
    })
})
