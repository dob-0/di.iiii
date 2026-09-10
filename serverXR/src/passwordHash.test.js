// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

// serverXR is CommonJS; the suite is ESM. Same bridge the other store tests use.
const require = createRequire(import.meta.url)
const { hashPassword, verifyPassword, needsRehash } = require('./passwordHash.js')

describe('the password verifier', () => {
    it('accepts the right password and refuses the wrong one', async () => {
        const stored = await hashPassword('correct horse battery staple')
        expect(await verifyPassword('correct horse battery staple', stored)).toBe(true)
        expect(await verifyPassword('Correct horse battery staple', stored)).toBe(false)
        expect(await verifyPassword('', stored)).toBe(false)
    })

    it('never stores the password, and never the same bytes twice', async () => {
        const password = 'a passphrase nobody else has'
        const a = await hashPassword(password)
        const b = await hashPassword(password)
        // A per-password salt is what stops one rainbow table answering for
        // every account that happened to choose the same words.
        expect(a).not.toBe(b)
        expect(a).not.toContain(password)
        expect(Buffer.from(a).toString('base64')).not.toContain(Buffer.from(password).toString('base64'))
        expect(await verifyPassword(password, b)).toBe(true)
    })

    it('carries its own cost, so it can be raised later', async () => {
        const stored = await hashPassword('x')
        expect(stored.startsWith('scrypt$65536$8$1$')).toBe(true)
        expect(needsRehash(stored)).toBe(false)
        // An old row hashed cheaply still verifies — and asks to be rewritten.
        expect(needsRehash('scrypt$16384$8$1$c2FsdA==$aGFzaA==')).toBe(true)
    })

    // Every one of these is a row an attacker or a bad migration could produce.
    // They must all answer false rather than throw, or the shape of the failure
    // becomes a way to ask which accounts are real.
    it('answers false for anything malformed, and never throws', async () => {
        for (const junk of [null, undefined, '', 'not-a-hash', 'scrypt$$$$$', 'argon2$1$2$3$4$5',
            'scrypt$abc$8$1$c2FsdA==$aGFzaA==', 'scrypt$65536$8$1$!!!$!!!']) {
            expect(await verifyPassword('anything', junk)).toBe(false)
        }
    })

    it('a unicode passphrase survives the round trip', async () => {
        const stored = await hashPassword('գաղտնաբառ 🔑 пароль')
        expect(await verifyPassword('գաղտնաբառ 🔑 пароль', stored)).toBe(true)
        expect(await verifyPassword('գաղտնաբառ 🔑 пароль ', stored)).toBe(false)
    })
})
