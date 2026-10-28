/**
 * "Join" — what `di follow` does, started from four words instead of a key.
 *
 * The browser on THIS install cannot reach the host (one side is https on a
 * certificate and the other plain http, and a browser refuses the mix — the same
 * reason machines/ relays through the servers), so the form talks to this
 * install's own server and THIS file reaches out:
 *
 *   1. find the host (the address a person typed, with or without a scheme);
 *   2. ask it about the code without spending it (found: space, projects, machine);
 *   3. refuse what `di follow` refuses: following yourself, a space already
 *      followed, and a same-named space already here unless the person said merge;
 *   4. spend the code and receive the real sync key;
 *   5. check the key works, make the space here, write the follow down.
 *
 * Step 3 comes BEFORE step 4 on purpose: a code is single-use, so everything
 * that can be refused is refused while it is still good. What can still fail
 * after it is spent is said as such ("the code is used — ask for a new one").
 *
 * No other state change than `follows.json`, which the running install already
 * watches (index.js), so the follower starts exactly as it does for `di follow`.
 * Spec: docs/architecture/SPEC_follow.md "Link a machine in two steps".
 */

const { httpRequest } = require('../httpClient')
const { DI_USER_AGENT } = require('../diUserAgent')
const names = require('./nameResolve')

const PROBE_TIMEOUT_MS = 4000
const CALL_TIMEOUT_MS = 8000

const call = async (url, { method = 'GET', token = null, body = null, timeoutMs = CALL_TIMEOUT_MS, send = httpRequest, address = null } = {}) => {
    const text = body ? JSON.stringify(body) : null
    try {
        const response = await send(url, {
            method,
            timeoutMs,
            ...(address ? { address } : {}),
            headers: {
                Accept: 'application/json',
                // Named here as well as in httpClient: `send` may be any client.
                'User-Agent': DI_USER_AGENT,
                ...(text ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) } : {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: text
        })
        return { ok: response.ok, status: response.status, payload: response.json() }
    } catch (error) {
        return { ok: false, status: 0, payload: null, error: String(error?.message || error) }
    }
}

/**
 * Where a person might mean, in the order worth trying. A dotted address or a
 * port is a machine on a network (plain http first); a name is a certificate's
 * name (https first). The API lives under /serverXR — try it with and without,
 * as `di follow` does.
 */
const candidateBases = (input) => {
    let text = String(input ?? '').trim().replace(/\/+$/, '')
    if (!text || /\s/.test(text)) return []
    const schemes = /^[a-z][a-z0-9+.-]*:\/\//i.test(text)
        ? [null]
        : (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(text) || /:\d+(\/|$)/.test(text) ? ['http://', 'https://'] : ['https://', 'http://'])
    const roots = []
    for (const scheme of schemes) {
        const root = scheme ? `${scheme}${text}` : text
        try {
            const url = new URL(root)
            if (!['http:', 'https:'].includes(url.protocol)) return []
            // A URL with credentials in it would be written to follows.json and logged.
            if (url.username || url.password) return []
        } catch { return [] }
        roots.push(root)
    }
    const out = []
    for (const root of roots) {
        if (root.endsWith('/serverXR')) out.push(root)
        else out.push(`${root}/serverXR`, root)
    }
    return out
}

/**
 * The host a person typed. A bare LABEL is a network name: it is found by the
 * one resolver `di follow` uses (beacon, DNS, last address — nameResolve.js) and
 * asked at that address, keeping the name for the certificate check.
 * @returns {Promise<{ base: string, pin?: string, name?: {label, zone}, via?: string }
 *                  | { base: null, reason: 'bad-address' | 'unreachable' | 'not-found' }>}
 */
const findHost = async (address, { send, resolveNamed = names.resolveName, zone = null } = {}) => {
    if (names.isLabel(address)) {
        const name = { label: String(address).trim(), zone: zone || names.readZone() }
        const found = await resolveNamed({ label: name.label, zone: name.zone })
        if (!found.ok) return { base: null, reason: 'not-found' }
        const root = names.nameBase(name.label, name.zone, found.port)
        for (const base of [`${root}/serverXR`, root]) {
            const health = await call(`${base}/api/health`, { timeoutMs: PROBE_TIMEOUT_MS, send, address: found.address })
            if (health.ok) return { base, pin: found.address, name, via: found.route }
        }
        return { base: null, reason: 'unreachable' }
    }
    const candidates = candidateBases(address)
    if (!candidates.length) return { base: null, reason: 'bad-address' }
    for (const base of candidates) {
        const health = await call(`${base}/api/health`, { timeoutMs: PROBE_TIMEOUT_MS, send })
        if (health.ok) return { base }
    }
    return { base: null, reason: 'unreachable' }
}

const refusal = (answer) => {
    if (answer.status === 429) return { ok: false, reason: 'throttled', retryAfterSeconds: Number(answer.payload?.retryAfterSeconds) || null }
    if (answer.status === 404 && !answer.payload?.code) return { ok: false, reason: 'host-too-old' }
    if (!answer.status) return { ok: false, reason: 'unreachable' }
    return { ok: false, reason: 'invalid-code' }
}

/**
 * Everything short of spending the code.
 *
 * @param {object} deps
 * @param {string} deps.dataDir
 * @param {() => {id: string, name: string}} deps.machine        this install
 * @param {(dataDir: string) => object} deps.readFollows
 * @param {(spaceId: string) => Promise<boolean>} deps.spaceExistsHere
 * @returns {Promise<{ok: true, base, spaceId, label, projects, hostName, hostId, localExists} | {ok: false, reason}>}
 */
const inspectJoin = async ({ address, code, dataDir, machine, readFollows, spaceExistsHere, send, resolveNamed, zone }) => {
    if (!String(code || '').trim()) return { ok: false, reason: 'invalid-code' }
    const found = await findHost(address, { send, resolveNamed, zone })
    if (!found.base) return { ok: false, reason: found.reason }
    const base = found.base

    const peek = await call(`${base}/api/join-codes/peek`, { method: 'POST', body: { code }, send, address: found.pin })
    if (!peek.ok) return refusal(peek)
    const spaceId = String(peek.payload?.spaceId || '')
    if (!spaceId) return { ok: false, reason: 'invalid-code' }
    const hostId = peek.payload?.machine?.id || null

    // Following yourself is a loop with no second person in it.
    if (hostId && hostId === machine().id) return { ok: false, reason: 'itself' }

    const already = readFollows(dataDir)[spaceId]
    if (already) return { ok: false, reason: 'already', spaceId }

    return {
        ok: true,
        base,
        pin: found.pin || null,
        name: found.name || null,
        via: found.via || null,
        spaceId,
        label: peek.payload?.label || spaceId,
        projects: Number.isFinite(peek.payload?.projects) ? peek.payload.projects : null,
        hostName: peek.payload?.machine?.name || null,
        hostId,
        localExists: await spaceExistsHere(spaceId)
    }
}

/**
 * Join: inspect, spend the code, check the key, make the space, write the follow.
 * `into` is the person's "yes, merge" for a same-named space already here.
 */
const joinSpace = async ({ address, code, into = false, dataDir, machine, readFollows, addFollow, spaceExistsHere, ensureSpace, send, resolveNamed, zone }) => {
    const seen = await inspectJoin({ address, code, dataDir, machine, readFollows, spaceExistsHere, send, resolveNamed, zone })
    if (!seen.ok) return seen
    // A space of that name already here is somebody's work: wiring a stranger's
    // log into it, and pushing its contents out to them, must be asked for.
    if (seen.localExists && !into) return { ok: false, reason: 'merge', spaceId: seen.spaceId }

    const redeemed = await call(`${seen.base}/api/join-codes/redeem`, {
        method: 'POST', body: { code, machine: { id: machine().id, name: machine().name } }, send, address: seen.pin
    })
    if (!redeemed.ok) return refusal(redeemed)
    const { token } = redeemed.payload || {}
    const spaceId = String(redeemed.payload?.spaceId || seen.spaceId)
    if (!token) return { ok: false, reason: 'invalid-code' }

    // From here the code is spent. Anything that fails says so.
    const ops = await call(`${seen.base}/api/spaces/${encodeURIComponent(spaceId)}/ops?since=0`, { token, send, address: seen.pin })
    if (!ops.ok) return { ok: false, reason: 'spent-denied', spaceId }

    try {
        await ensureSpace(spaceId, seen.label)
    } catch {
        return { ok: false, reason: 'spent-local-space', spaceId }
    }
    // A space made empty by this Join takes the host's whole history: that IS the copy, and
    // an empty log has nothing to flood the host with. Since dev's from-now start (follower.js)
    // it must ask for the replay, or the joiner stays empty. A merge into a space already here
    // starts from now and is compared once (converge), as any follow.
    await addFollow(dataDir, spaceId, { remote: seen.base, token, label: seen.hostName, start: seen.localExists ? null : 'replay', name: seen.name, via: seen.via, lastAddress: seen.pin })
    return { ok: true, spaceId, base: seen.base, hostName: seen.hostName, label: seen.label, merged: seen.localExists }
}

module.exports = { candidateBases, findHost, inspectJoin, joinSpace }
