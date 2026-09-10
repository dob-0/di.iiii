// End-to-end encryption for a direct conversation between two people.
//
// The promise this file has to keep is narrow and absolute: **di.iiii's server
// never holds a key that can read a direct message.** It carries ciphertext
// past a firewall when the two browsers cannot reach each other, it introduces
// the two devices to each other, and that is the whole of its part.
//
// Nothing exotic, on purpose. WebCrypto's own P-256 ECDH and AES-GCM, present
// in every browser this platform already requires and in Node, so there is no
// dependency to audit, no library to keep patched, and the same code can be
// tested outside a browser.
//
// WHAT THIS DOES NOT DO, said here rather than discovered later:
//
//   · It does not authenticate the other person by itself. A key comes from
//     the server, so a server that lied could hand you its own key and read
//     everything — the classic middle. `fingerprint()` is the answer to that,
//     and it is only an answer if two people actually compare it out loud.
//   · It has no forward secrecy. One long-lived key pair per device means a
//     stolen private key reads every past message that was captured. Ratcheting
//     is the fix and it is not here; do not describe this as Signal.
//   · A lost device is lost history. There is no key escrow, because escrow is
//     a copy of the key held by somebody who is not you.

const SUBTLE = () => {
    const crypto = globalThis.crypto
    if (!crypto?.subtle) throw new Error('This browser has no WebCrypto, so it cannot hold a private conversation.')
    return crypto.subtle
}

const CURVE = { name: 'ECDH', namedCurve: 'P-256' }
const CIPHER = 'AES-GCM'
const IV_BYTES = 12

const toBase64 = (bytes) => {
    const view = new Uint8Array(bytes)
    let binary = ''
    for (const byte of view) binary += String.fromCharCode(byte)
    return btoa(binary)
}

const fromBase64 = (value) => {
    const binary = atob(String(value))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
}

/** A new identity for THIS device. The private half never leaves it. */
export const createIdentity = async () => {
    const pair = await SUBTLE().generateKey(CURVE, true, ['deriveKey'])
    return pair
}

export const exportPublicKey = async (pair) => toBase64(await SUBTLE().exportKey('raw', pair.publicKey))

export const importPublicKey = async (base64) =>
    SUBTLE().importKey('raw', fromBase64(base64), CURVE, true, [])

// Exported so a device can keep its identity across reloads. The private key is
// written to IndexedDB/localStorage by the caller and never sent anywhere; if
// that storage is cleared the conversation's history is unreadable, which is
// the honest cost of nobody else holding a copy.
export const exportIdentity = async (pair) => ({
    publicKey: await exportPublicKey(pair),
    privateKey: toBase64(await SUBTLE().exportKey('pkcs8', pair.privateKey))
})

export const importIdentity = async ({ publicKey, privateKey }) => ({
    publicKey: await importPublicKey(publicKey),
    privateKey: await SUBTLE().importKey('pkcs8', fromBase64(privateKey), CURVE, true, ['deriveKey'])
})

/** The shared secret. Both sides derive the same key and neither sends it. */
export const deriveConversationKey = async (myPair, theirPublicKey) =>
    SUBTLE().deriveKey(
        { name: 'ECDH', public: theirPublicKey },
        myPair.privateKey,
        { name: CIPHER, length: 256 },
        false,
        ['encrypt', 'decrypt']
    )

/**
 * Returns { iv, body } — both base64, both meaningless without the key.
 *
 * A fresh IV per message, from the system's own randomness. AES-GCM with a
 * repeated IV under the same key is not "weaker", it is broken: two messages
 * XOR to plaintext. This is the one line in this file where a clever
 * optimisation would be a catastrophe.
 */
export const encrypt = async (key, text) => {
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES))
    const body = await SUBTLE().encrypt({ name: CIPHER, iv }, key, new TextEncoder().encode(String(text)))
    return { iv: toBase64(iv), body: toBase64(body) }
}

/**
 * Returns the text, or null. Never throws for a caller: a message that will not
 * open is an ordinary event on this wire — the other side rotated a key, a
 * relay handed over something corrupt, somebody tampered — and each of those
 * has to render as "this message could not be read" rather than crash the room.
 */
export const decrypt = async (key, { iv, body } = {}) => {
    try {
        const plain = await SUBTLE().decrypt(
            { name: CIPHER, iv: fromBase64(iv) },
            key,
            fromBase64(body)
        )
        return new TextDecoder().decode(plain)
    } catch {
        return null
    }
}

/**
 * The words two people read to each other to know that no server sat in the
 * middle. Derived from both public keys, sorted, so both sides see the SAME
 * string whichever of them is asking.
 *
 * Six groups of four hex characters. Short enough to say on the phone, long
 * enough (96 bits) that producing a colliding key pair is not a thing anyone
 * can do.
 */
export const fingerprint = async (publicKeyA, publicKeyB) => {
    const pair = [String(publicKeyA), String(publicKeyB)].sort().join('|')
    const digest = await SUBTLE().digest('SHA-256', new TextEncoder().encode(pair))
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
    return hex.slice(0, 24).match(/.{4}/g).join(' ')
}
