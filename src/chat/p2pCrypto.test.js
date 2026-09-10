// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { webcrypto } from 'node:crypto'
import { Buffer } from 'node:buffer'

// The module reaches for the browser's globals; Node has the same WebCrypto.
// `globalThis.crypto` is a getter with no setter in Node 22, so it is defined
// rather than assigned — plain assignment throws before a single test runs.
if (!globalThis.crypto) {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
}
if (!globalThis.btoa) globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64')
if (!globalThis.atob) globalThis.atob = (s) => Buffer.from(s, 'base64').toString('binary')

const {
    createIdentity, exportPublicKey, importPublicKey, exportIdentity, importIdentity,
    deriveConversationKey, encrypt, decrypt, fingerprint
} = await import('./p2pCrypto.js')

const twoPeople = async () => {
    const a = await createIdentity()
    const b = await createIdentity()
    const aSeesB = await importPublicKey(await exportPublicKey(b))
    const bSeesA = await importPublicKey(await exportPublicKey(a))
    return {
        a, b,
        keyForA: await deriveConversationKey(a, aSeesB),
        keyForB: await deriveConversationKey(b, bSeesA)
    }
}

describe('a conversation only two people can read', () => {
    it('both sides derive the same key without sending one', async () => {
        const { keyForA, keyForB } = await twoPeople()
        const sealed = await encrypt(keyForA, 'the thing I only want to say to you')
        expect(await decrypt(keyForB, sealed)).toBe('the thing I only want to say to you')
    })

    // The whole promise: a server holding every public key and every byte on
    // the wire still cannot read a word.
    it('a third party with both public keys and the ciphertext gets nothing', async () => {
        const { a, b, keyForA } = await twoPeople()
        const sealed = await encrypt(keyForA, 'private')

        const eavesdropper = await createIdentity()
        const wrongKey = await deriveConversationKey(
            eavesdropper,
            await importPublicKey(await exportPublicKey(b))
        )
        expect(await decrypt(wrongKey, sealed)).toBe(null)
        // and the ciphertext itself carries nothing readable
        expect(JSON.stringify(sealed)).not.toContain('private')
        expect(await exportPublicKey(a)).not.toContain('private')
    })

    it('never reuses an IV — the one mistake that would break it outright', async () => {
        const { keyForA } = await twoPeople()
        const ivs = new Set()
        for (let i = 0; i < 200; i++) ivs.add((await encrypt(keyForA, 'same text every time')).iv)
        expect(ivs.size).toBe(200)
    })

    it('the same words twice look nothing alike', async () => {
        const { keyForA } = await twoPeople()
        const first = await encrypt(keyForA, 'hello')
        const second = await encrypt(keyForA, 'hello')
        expect(first.body).not.toBe(second.body)
    })

    // A tampered message must not open. AES-GCM authenticates; this proves the
    // caller actually benefits from that rather than swallowing a bad decrypt.
    it('refuses a message somebody edited on the way', async () => {
        const { keyForA, keyForB } = await twoPeople()
        const sealed = await encrypt(keyForA, 'transfer it to me')
        const bytes = Buffer.from(sealed.body, 'base64')
        bytes[4] ^= 0xff
        expect(await decrypt(keyForB, { iv: sealed.iv, body: bytes.toString('base64') })).toBe(null)
    })

    // Every one of these arrives on a real wire. None may throw: an unreadable
    // message renders as unreadable, it does not take the room down.
    it('answers null for junk rather than throwing', async () => {
        const { keyForB } = await twoPeople()
        for (const junk of [undefined, {}, { iv: '', body: '' }, { iv: 'nope', body: 'nope' },
            { iv: 'AAAAAAAAAAAAAAAA', body: 'AAAA' }]) {
            expect(await decrypt(keyForB, junk)).toBe(null)
        }
    })

    it('an identity survives being stored and read back', async () => {
        const { a, b } = await twoPeople()
        const stored = await exportIdentity(a)
        const restored = await importIdentity(stored)
        const key = await deriveConversationKey(restored, await importPublicKey(await exportPublicKey(b)))
        const sealed = await encrypt(key, 'still me after a reload')
        const theirKey = await deriveConversationKey(b, await importPublicKey(stored.publicKey))
        expect(await decrypt(theirKey, sealed)).toBe('still me after a reload')
    })
})

describe('the fingerprint two people read to each other', () => {
    it('is the same string on both sides, whoever asks', async () => {
        const a = await exportPublicKey(await createIdentity())
        const b = await exportPublicKey(await createIdentity())
        expect(await fingerprint(a, b)).toBe(await fingerprint(b, a))
    })

    it('changes completely if a key is swapped — which is the point', async () => {
        const a = await exportPublicKey(await createIdentity())
        const b = await exportPublicKey(await createIdentity())
        const middle = await exportPublicKey(await createIdentity())
        expect(await fingerprint(a, middle)).not.toBe(await fingerprint(a, b))
    })

    it('is short enough to say out loud', async () => {
        const a = await exportPublicKey(await createIdentity())
        const b = await exportPublicKey(await createIdentity())
        const words = await fingerprint(a, b)
        expect(words).toMatch(/^[0-9a-f]{4}( [0-9a-f]{4}){5}$/)
    })
})
