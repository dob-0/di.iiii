/**
 * `di invite` and `di follow` — one space, two installs.
 *
 * All I/O for sharing a space with another artist's di.iiii. What it MEANS to
 * follow is decided in serverXR/src/follow (the engine that carries the ops);
 * this file only mints the key, checks the far side is really there, and writes
 * the follow down.
 *
 * The credential is a per-space sync key: editor role, scoped to exactly one
 * space, revocable by its owner. An install token would hand over the whole
 * machine, and there is no world in which lending someone a room should do
 * that.
 */

import http from 'node:http'
import https from 'node:https'
import net from 'node:net'

const TIMEOUT_MS = 8000

/**
 * The ADDRESS PIN's dns.lookup replacement — the name stays, the socket goes
 * to this address. Must honour both forms Node calls a custom lookup with:
 * the classic `(err, address, family)` callback, and the `{ all: true }` form
 * Node 20+ uses under Happy Eyeballs, which wants `(err, addresses[])`.
 */
const pinnedLookup = (address) => (hostname, options, callback) => {
    if (typeof options === 'function') { callback = options; options = {} }
    const family = net.isIP(address) === 6 ? 6 : 4
    if (options && options.all) return callback(null, [{ address, family }])
    return callback(null, address, family)
}

/**
 * global fetch cannot pin a socket to an address while keeping the URL's
 * hostname for the Host header, SNI and certificate check — so an address
 * pin is done with node:http/https directly, never with serverXR's own
 * httpClient (the CLI cannot import serverXR — see follows.mjs).
 */
const pinnedRequest = (url, { method = 'GET', token = null, body = null, address = null } = {}) =>
    new Promise((resolve) => {
        let u
        try { u = new URL(url) } catch (error) { resolve({ ok: false, status: 0, payload: null, error: String(error?.message || error) }); return }
        const lib = u.protocol === 'https:' ? https : http
        const payload = body ? JSON.stringify(body) : null
        const timer = setTimeout(() => req.destroy(new Error('request timeout')), TIMEOUT_MS)
        const req = lib.request(u, {
            method,
            lookup: pinnedLookup(address),
            // `agent: false` — no pooling, ever. Node's Agent pools sockets
            // keyed by host:port and does not include `lookup` in that key, so
            // a pinned request could otherwise silently ride a keep-alive
            // socket a PREVIOUS request already opened to the same hostname's
            // default (or a different pinned) address — caught live: a request
            // pinned to one address, then a second pinned to a different one,
            // answering from the first's socket without ever connecting to the
            // second. These are one-shot pre-checks, not a long-running
            // follower, so there is nothing worth pooling for.
            agent: false,
            headers: {
                Accept: 'application/json',
                ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            }
        }, (res) => {
            const chunks = []
            res.on('data', (chunk) => chunks.push(chunk))
            res.on('end', () => {
                clearTimeout(timer)
                const text = Buffer.concat(chunks).toString('utf8')
                let parsed = null
                try { parsed = JSON.parse(text) } catch { parsed = null }
                resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, payload: parsed })
            })
        })
        req.on('error', (error) => {
            clearTimeout(timer)
            // The one distinction the CLI needs that a plain "unreachable"
            // does not carry: something answered the pinned address, but its
            // certificate was not for the name in --from.
            resolve({
                ok: false,
                status: 0,
                payload: null,
                error: String(error?.message || error),
                certMismatch: error?.code === 'ERR_TLS_CERT_ALTNAME_INVALID'
            })
        })
        if (payload) req.write(payload)
        req.end()
    })

const request = async (url, { method = 'GET', token = null, body = null, address = null } = {}) => {
    if (address) return pinnedRequest(url, { method, token, body, address })
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
        const response = await fetch(url, {
            method,
            signal: controller.signal,
            headers: {
                Accept: 'application/json',
                ...(body ? { 'Content-Type': 'application/json' } : {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            ...(body ? { body: JSON.stringify(body) } : {})
        })
        let payload = null
        try { payload = await response.json() } catch { payload = null }
        return { ok: response.ok, status: response.status, payload }
    } catch (error) {
        return { ok: false, status: 0, payload: null, error: String(error?.message || error) }
    } finally {
        clearTimeout(timer)
    }
}

/**
 * Where a di.iiii answers, given whatever a person typed.
 *
 * Someone will type the address they read off the other laptop's screen —
 * `https://local.thedi.studio` — and the API lives under /serverXR. Probe both
 * rather than make them care.
 *
 * With an address pin, also says WHY nothing answered: a certificate that
 * answers under the wrong name at that address is a different problem than
 * nothing answering at all, and the CLI wants a different sentence for each.
 */
export const resolveBase = async (input, { address = null } = {}) => {
    const trimmed = String(input || '').trim().replace(/\/$/, '')
    if (!trimmed) return { base: null, reason: 'unreachable' }
    const candidates = trimmed.endsWith('/serverXR')
        ? [trimmed]
        : [`${trimmed}/serverXR`, trimmed]
    let reason = 'unreachable'
    for (const base of candidates) {
        const health = await request(`${base}/api/health`, { address })
        if (health.ok) return { base, reason: null }
        if (health.certMismatch) reason = 'cert-mismatch'
    }
    return { base: null, reason }
}

/** Mint a key for one space on THIS install, for someone else to follow with. */
export const mintInvite = async ({ base, spaceId, token, label = 'follow' }) => {
    const answer = await request(`${base}/api/spaces/${encodeURIComponent(spaceId)}/sync-keys`, {
        method: 'POST',
        token,
        body: { label }
    })
    if (!answer.ok) return { ok: false, status: answer.status, reason: answer.payload?.error || answer.error || null }
    const key = answer.payload?.token || answer.payload?.key?.token || null
    if (!key) return { ok: false, status: answer.status, reason: 'the server minted no key' }
    return { ok: true, key }
}

/**
 * Is this a real di.iiii, does the space exist there, and does the key work?
 *
 * Checked before anything is written down, because a follow that was accepted
 * and then silently does nothing is worse than a refusal a person can read.
 */
export const checkFollowable = async ({ base, spaceId, key, address = null }) => {
    const health = await request(`${base}/api/health`, { address })
    if (!health.ok) return { ok: false, reason: health.certMismatch ? 'cert-mismatch' : 'unreachable' }

    const ops = await request(`${base}/api/spaces/${encodeURIComponent(spaceId)}/ops?since=0`, { token: key, address })
    if (ops.status === 404) return { ok: false, reason: 'missing' }
    if (ops.status === 401 || ops.status === 403) return { ok: false, reason: 'denied' }
    if (!ops.ok) return { ok: false, reason: ops.certMismatch ? 'cert-mismatch' : 'unreachable' }
    return { ok: true, latestVersion: ops.payload?.latestVersion ?? null }
}

/** The identity of the di.iiii at a base — used to refuse following yourself. */
export const instanceOf = async (base, { address = null } = {}) => {
    const health = await request(`${base}/api/health`, { address })
    if (!health.ok) return null
    const { startedAt = null, port = null } = health.payload || {}
    return `${startedAt}:${port}`
}

/** Revoke a key minted by `di invite`. */
export const listInvites = async ({ base, spaceId, token }) => {
    const answer = await request(`${base}/api/spaces/${encodeURIComponent(spaceId)}/sync-keys`, { token })
    return answer.ok ? (answer.payload?.keys || []) : []
}

export const revokeInvite = async ({ base, spaceId, keyId, token }) => {
    const answer = await request(`${base}/api/spaces/${encodeURIComponent(spaceId)}/sync-keys/${encodeURIComponent(keyId)}`, {
        method: 'DELETE',
        token
    })
    return answer.ok
}

/** Does this install already hold that space? */
export const localSpaceExists = async ({ base, spaceId, token = null }) => {
    const answer = await request(`${base}/api/spaces/${encodeURIComponent(spaceId)}`, { token })
    return answer.ok
}

/**
 * Make the space here, so there is something for the ops to land in. Same route
 * the Spaces page uses; a space that already exists is left exactly as it is.
 */
export const createLocalSpace = async ({ base, spaceId, token = null, label = null }) => {
    if (await localSpaceExists({ base, spaceId, token })) return { ok: true, created: false }
    const answer = await request(`${base}/api/spaces`, {
        method: 'POST',
        token,
        body: { id: spaceId, label: label || spaceId }
    })
    if (!answer.ok) return { ok: false, created: false, reason: answer.payload?.error || answer.status }
    return { ok: true, created: true }
}
