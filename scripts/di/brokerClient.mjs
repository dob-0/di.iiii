/**
 * The install's signed calls to the name broker (docs/ai/team-sync-by-network-name.md §5, §7).
 *
 * One module for the signing, used by the CLI (`di name`) and by the server's
 * share door (serverXR/src/shareDoor.js loads it with import()). Minimal on
 * purpose: sign a request, move the label's address.
 *
 * The signature is Ed25519 (RFC 8032) over
 *   `${method}\n${path}\n${ts}\n${sha256hex(body)}`
 * sent base64url in X-Di-Sig, with X-Di-Label and X-Di-Ts (unix seconds).
 * The key is the install's own, ~/.di/name/install.key; it never leaves the machine.
 */
import crypto from 'node:crypto'

// PKCS#8 prefix of an Ed25519 private key (RFC 8410 §7): the 32-byte seed follows.
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex')

/** A PEM key, or a bare 32-byte seed written as base64url / hex. */
export const readInstallKey = (text) => {
    const raw = String(text || '').trim()
    if (raw.includes('BEGIN')) return crypto.createPrivateKey(raw)
    const seed = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64url')
    if (seed.length !== 32) throw new Error('install.key is neither a PEM key nor a 32-byte seed')
    return crypto.createPrivateKey({ key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]), format: 'der', type: 'pkcs8' })
}

export const signingString = ({ method, path, ts, body = '' }) =>
    `${String(method).toUpperCase()}\n${path}\n${ts}\n${crypto.createHash('sha256').update(body).digest('hex')}`

/** The three headers for one call. */
export const signRequest = ({ method, path, body = '', label, key, ts = Math.floor(Date.now() / 1000) }) => ({
    'X-Di-Label': label,
    'X-Di-Ts': String(ts),
    'X-Di-Sig': crypto.sign(null, Buffer.from(signingString({ method, path, ts, body })), key).toString('base64url')
})

/**
 * Move the label's address. Resolves { ok, status }; never throws on a refusal,
 * so the caller can say why (an unreachable broker is `status: 0`).
 */
export const putAddress = async ({ brokerUrl, label, address, key, fetchImpl = fetch, ts }) => {
    const path = `/v1/labels/${encodeURIComponent(label)}/address`
    const body = JSON.stringify({ address })
    try {
        const response = await fetchImpl(`${String(brokerUrl).replace(/\/+$/, '')}${path}`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json', ...signRequest({ method: 'PUT', path, body, label, key, ts }) },
            body,
            signal: AbortSignal.timeout(8000)
        })
        return { ok: response.status === 204, status: response.status }
    } catch (error) {
        return { ok: false, status: 0, error: String(error?.message || error) }
    }
}
