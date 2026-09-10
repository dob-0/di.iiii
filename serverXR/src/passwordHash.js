const crypto = require('node:crypto')

/**
 * Passwords are HASHED, never encrypted. Encryption implies a key that can turn
 * the ciphertext back into the password, and nothing here — not the server, not
 * an admin, not a stolen backup — should ever be able to do that. What is stored
 * is a one-way verifier: enough to check a password, never enough to learn one.
 *
 * scrypt, because it is in Node itself (no dependency to trust or update) and it
 * is memory-hard: an attacker with a GPU farm cannot turn the cost into silicon
 * as cheaply as they can with PBKDF2 or a bare SHA.
 *
 * The whole verifier is one string — `scrypt$N$r$p$salt$hash` — so the cost can
 * be raised later without a migration and without guessing what an old row was
 * hashed with. `needsRehash` is what makes that raise actually happen: the next
 * time the person signs in, their row is quietly rewritten at the new cost.
 */

// 2^16 · 8 · 1 ≈ 64 MB per hash. Deliberately above the usual 2^15 default:
// this is a small install where a login happens seldom and a stolen database
// would otherwise be a weekend's work for anyone with a rented GPU.
const N = 65536
const R = 8
const P = 1
const KEY_LENGTH = 64
const SALT_BYTES = 16
// scrypt's own memory guard is 32 MB by default and refuses these parameters
// outright; raising the cost without raising this fails every hash with
// "Invalid scrypt params", which is a confusing way to learn about a constant.
const MAX_MEMORY = 256 * 1024 * 1024

const scrypt = (password, salt, keylen, params) => new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, params, (error, derived) => {
        if (error) reject(error)
        else resolve(derived)
    })
})

const encode = (parts) => parts.join('$')

/** `scrypt$N$r$p$<salt base64>$<hash base64>` */
const hashPassword = async (password) => {
    const salt = crypto.randomBytes(SALT_BYTES)
    const derived = await scrypt(String(password), salt, KEY_LENGTH, { N, r: R, p: P, maxmem: MAX_MEMORY })
    return encode(['scrypt', N, R, P, salt.toString('base64'), derived.toString('base64')])
}

const parse = (stored) => {
    const parts = String(stored || '').split('$')
    if (parts.length !== 6 || parts[0] !== 'scrypt') return null
    const [, n, r, p, salt, hash] = parts
    const params = { N: Number(n), r: Number(r), p: Number(p) }
    // POSITIVE, not merely finite. `scrypt$$$$$` parses into six parts, and
    // Number('') is 0, which is finite — so a row of nothing but separators
    // produced N=0, an empty salt and a ZERO-LENGTH hash. scrypt happily
    // derives zero bytes, timingSafeEqual finds two empty buffers equal, and
    // that verifier accepted every password ever typed at it. Caught by
    // passwordHash.test.js on the day this was written; the malformed-row case
    // is not paranoia, it is the whole point.
    if (!(params.N > 0) || !(params.r > 0) || !(params.p > 0)) return null
    try {
        const saltBytes = Buffer.from(salt, 'base64')
        const hashBytes = Buffer.from(hash, 'base64')
        if (saltBytes.length === 0 || hashBytes.length === 0) return null
        return { params, salt: saltBytes, hash: hashBytes }
    } catch {
        return null
    }
}

/**
 * Constant-time, and it never throws for a caller: a malformed row, a missing
 * hash and a wrong password must all take the same path and answer the same
 * `false`. A verifier that threw on one of them would tell an attacker which
 * accounts exist.
 */
const verifyPassword = async (password, stored) => {
    const parsed = parse(stored)
    if (!parsed) return false
    try {
        const derived = await scrypt(String(password), parsed.salt, parsed.hash.length, {
            ...parsed.params,
            maxmem: MAX_MEMORY
        })
        return crypto.timingSafeEqual(derived, parsed.hash)
    } catch {
        return false
    }
}

/** True when a stored verifier is weaker than what we would write today. */
const needsRehash = (stored) => {
    const parsed = parse(stored)
    if (!parsed) return true
    return parsed.params.N < N || parsed.params.r < R || parsed.params.p < P
}

module.exports = { hashPassword, verifyPassword, needsRehash, SCRYPT_N: N }
