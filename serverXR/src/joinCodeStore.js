// Join codes — four words that stand in, for ten minutes and once, for a
// per-space sync key, so a second machine can follow a space without anybody
// copying a 60-character key out of a terminal.
// Spec: docs/architecture/SPEC_follow.md "Link a machine in two steps".
// Companion of syncKeyStore.js (the key it stands for) and inviteStore.js.
//
//   AMBER · DESK · NINE · RIVER      <- shown once on the host, typed on the other machine
//
// What is stored, and what is not:
//  - only sha256 of the four words (domain-separated), never the words;
//  - NO key is stored. The key is minted by syncKeyStore.mintSyncKey at the moment
//    the code is redeemed, under the same owner and the same ttl as a key minted
//    by POST /api/spaces/:spaceId/sync-keys, and handed to the redeemer in that
//    one response. A code nobody redeems therefore never becomes a credential,
//    and a database read finds nothing to replay.
//
// What bounds a four-word code (1257 words ≈ 41 bits):
//  - it lives CODE_TTL_MS (10 minutes) and works once: redeem is one atomic
//    UPDATE ... WHERE used_at IS NULL, so two joiners cannot both win;
//  - a space has ONE live code: issuing a new one revokes the unused older one;
//  - guesses are counted here, per client and across all clients, and are NOT
//    exempt on a local install (rateLimit.js exempts those — and a local install
//    reached over the LAN is exactly where this is used);
//  - wrong, used, expired and revoked all answer the same ("invalid").
//
// A code is not a password. It is a short-lived hand-over between two people
// standing in the same room (or on the same call).

const crypto = require('node:crypto')
const { getDb } = require('./db')
const { WORDS } = require('./joinCodeWords')
const { mintSyncKey } = require('./syncKeyStore')

const CODE_TTL_MS = 10 * 60 * 1000
const WORDS_PER_CODE = 4
// A key minted by a join lives as long as one minted by the sync-keys route.
const KEY_TTL_MS = 365 * 24 * 60 * 60 * 1000
const HASH_DOMAIN = 'di.join-code.v1:'
// Rows are dropped a day after they were made (they ended minutes after).
const KEEP_ENDED_MS = 24 * 60 * 60 * 1000

const WORD_SET = new Set(WORDS)

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex')
const hashWords = (words) => sha256(`${HASH_DOMAIN}${words.join(' ')}`)

/**
 * Whatever a person typed -> the four words, or null. Accepts spaces, the
 * middle dot the host shows, commas and dashes; any case. Every word must be
 * on the list: a typo is refused before anything touches the database.
 */
const normaliseCode = (input) => {
  const parts = Array.isArray(input) ? input : String(input ?? '').split(/[\s·•.,;:|/\\_-]+/)
  const words = parts.map((part) => String(part).trim().toLowerCase()).filter(Boolean)
  if (words.length !== WORDS_PER_CODE) return null
  return words.every((word) => WORD_SET.has(word)) ? words : null
}

/** The way the host shows it, and the way the sketch writes it. */
const formatCode = (words) => words.map((word) => word.toUpperCase()).join(' · ')

const pickWords = (randomInt = crypto.randomInt) => (
  Array.from({ length: WORDS_PER_CODE }, () => WORDS[randomInt(WORDS.length)])
)

const rowToPublic = (row) => row && ({
  id: row.id,
  spaceId: row.space_id,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  usedAt: row.used_at || null,
  revoked: !!row.revoked
})

/**
 * Make a code for an existing space. The caller must already have checked that
 * the person may manage the space (requireSpaceOwnerOrAdmin in index.js).
 * @returns {{ id: string, words: string[], code: string, expiresAt: number }}
 */
const issueJoinCode = ({ spaceId, ownerUserId = null, now = Date.now(), ttlMs = CODE_TTL_MS, randomInt = crypto.randomInt } = {}) => {
  const db = getDb()
  const run = db.transaction(() => {
    // One live code per space.
    db.prepare('UPDATE space_join_codes SET revoked = 1 WHERE space_id = ? AND used_at IS NULL AND revoked = 0').run(spaceId)
    // A code lives ten minutes, so anything older than a day has ended.
    db.prepare('DELETE FROM space_join_codes WHERE created_at < ?').run(now - KEEP_ENDED_MS)
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const words = pickWords(randomInt)
      const id = crypto.randomBytes(8).toString('hex')
      try {
        db.prepare(
          `INSERT INTO space_join_codes (id, space_id, owner_user_id, code_hash, created_at, expires_at, used_at, revoked, key_id)
           VALUES (?, ?, ?, ?, ?, ?, NULL, 0, NULL)`
        ).run(id, spaceId, ownerUserId, hashWords(words), now, now + ttlMs)
        return { id, words, code: formatCode(words), expiresAt: now + ttlMs }
      } catch (error) {
        // The same four words are already on file (a rare collision with an
        // older row): draw again.
        if (!/UNIQUE/i.test(String(error?.message || error))) throw error
      }
    }
    throw new Error('could not draw a free join code')
  })
  return run()
}

const liveRow = (words, now) => getDb().prepare(
  'SELECT * FROM space_join_codes WHERE code_hash = ? AND used_at IS NULL AND revoked = 0 AND expires_at > ?'
).get(hashWords(words), now)

/** Is this a live code, and for which space? Never consumes it. */
const peekJoinCode = (input, { now = Date.now() } = {}) => {
  const words = normaliseCode(input)
  if (!words) return null
  const row = liveRow(words, now)
  return row ? { id: row.id, spaceId: row.space_id, expiresAt: row.expires_at } : null
}

/**
 * Spend a code: once, atomically, and mint the sync key it stands for.
 * `machineName` only labels the key ("join · AYLMO") so the host's list of
 * keys can say whose it is.
 * @returns {{ spaceId: string, token: string, keyId: string } | null}  null = invalid, whatever the reason
 */
const redeemJoinCode = (input, { now = Date.now(), machineName = '' } = {}) => {
  const words = normaliseCode(input)
  if (!words) return null
  const db = getDb()
  const run = db.transaction(() => {
    const row = liveRow(words, now)
    if (!row) return null
    const spent = db.prepare(
      'UPDATE space_join_codes SET used_at = ? WHERE id = ? AND used_at IS NULL AND revoked = 0 AND expires_at > ?'
    ).run(now, row.id, now)
    if (!spent.changes) return null
    const name = String(machineName || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 60)
    const { token, key } = mintSyncKey({
      spaceId: row.space_id,
      ownerUserId: row.owner_user_id,
      label: name ? `follow · ${name}` : 'follow',
      ttlMs: KEY_TTL_MS
    })
    db.prepare('UPDATE space_join_codes SET key_id = ? WHERE id = ?').run(key.id, row.id)
    return { spaceId: row.space_id, token, keyId: key.id }
  })
  return run()
}

/** The live code for a space, if any — never the words (they are not kept). */
const liveJoinCode = (spaceId, { now = Date.now() } = {}) => rowToPublic(getDb().prepare(
  'SELECT * FROM space_join_codes WHERE space_id = ? AND used_at IS NULL AND revoked = 0 AND expires_at > ? ORDER BY created_at DESC LIMIT 1'
).get(spaceId, now))

/** Revoke a code that has not been used. A used one stands for a key: revoke that. */
const revokeJoinCode = (spaceId, id) => getDb().prepare(
  'UPDATE space_join_codes SET revoked = 1 WHERE id = ? AND space_id = ? AND used_at IS NULL AND revoked = 0'
).run(id, spaceId).changes > 0

/**
 * Counts WRONG guesses, per client and over everyone. Not Express middleware
 * and not rateLimit.js: that one steps aside on a local install, and a local
 * install on the LAN is the case this guards. Success is not counted.
 */
const createAttemptLimiter = ({ perClient = 8, overall = 60, windowMs = 10 * 60_000, now = () => Date.now() } = {}) => {
  const clients = new Map()
  let everyone = { count: 0, resetAt: 0 }
  const bucketFor = (bucket, at) => (bucket && at < bucket.resetAt ? bucket : { count: 0, resetAt: at + windowMs })
  return {
    /** @returns {{ ok: true } | { ok: false, retryAfterSeconds: number }} */
    check(client) {
      const at = now()
      const mine = clients.get(client)
      const waits = []
      if (mine && at < mine.resetAt && mine.count >= perClient) waits.push(mine.resetAt)
      if (at < everyone.resetAt && everyone.count >= overall) waits.push(everyone.resetAt)
      if (!waits.length) return { ok: true }
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((Math.max(...waits) - at) / 1000)) }
    },
    fail(client) {
      const at = now()
      const mine = bucketFor(clients.get(client), at)
      mine.count += 1
      clients.set(client, mine)
      everyone = bucketFor(everyone, at)
      everyone.count += 1
      if (clients.size > 5000) for (const [key, bucket] of clients) if (at >= bucket.resetAt) clients.delete(key)
    }
  }
}

module.exports = {
  CODE_TTL_MS,
  WORDS_PER_CODE,
  normaliseCode,
  formatCode,
  issueJoinCode,
  peekJoinCode,
  redeemJoinCode,
  liveJoinCode,
  revokeJoinCode,
  createAttemptLimiter
}
