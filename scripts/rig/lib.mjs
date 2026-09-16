/**
 * scripts/rig/lib.mjs — shared plumbing for the rig grid tools (conformance,
 * start-member, compat-grid, mock-member). Not a protocol implementation of
 * its own: rig/protocol.js and rig/features.js are lane A's files
 * (serverXR/src/rig/*, not yet on this branch). Everything here is a small,
 * deliberately duplicated black-box stand-in so this lane's tools and its
 * self-test mock agree on the same frozen shapes from docs/architecture/rig/
 * PROTOCOL-1.md §2–§6. If protocol.js and this file ever disagree once lane A
 * lands, protocol.js wins — update this file to match.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:net'

/** §3 — the local feature table every step-1 member ships. */
export const LOCAL_FEATURES = Object.freeze({
    card: 1,
    cue: 1,
    blackout: 1,
    members: 1,
    discovery: 1
})

/**
 * §3 agree(a, b): a key for every name present in BOTH tables whose value is
 * a positive integer on BOTH sides, set to min(a[k], b[k]). Non-integer, zero
 * or negative values are ignored — on either side, not just the local one.
 */
export const agree = (a, b) => {
    const out = {}
    const left = a && typeof a === 'object' ? a : {}
    const right = b && typeof b === 'object' ? b : {}
    const isPositiveInt = (v) => Number.isInteger(v) && v > 0
    for (const key of Object.keys(left)) {
        if (!(key in right)) continue
        if (!isPositiveInt(left[key]) || !isPositiveInt(right[key])) continue
        out[key] = Math.min(left[key], right[key])
    }
    return out
}

/** §5 — hex HMAC-SHA256(key, rawBody). */
export const sign = (key, rawBody) => createHmac('sha256', key).update(rawBody).digest('hex')

/** §5 — timing-safe verify. rawBody and sig are both strings/Buffers. */
export const verify = (key, rawBody, sig) => {
    if (typeof sig !== 'string' || sig.length === 0) return false
    const expected = sign(key, rawBody)
    const a = Buffer.from(expected, 'hex')
    const b = Buffer.from(sig, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
}

/** A free TCP port on 127.0.0.1, picked by the OS. */
export const freePort = () => new Promise((resolve, reject) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
        const { port } = srv.address()
        srv.close(() => resolve(port))
    })
})

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Poll a health URL until it answers ok, or throw once the deadline passes. */
export const waitForHealth = async (healthUrl, { timeoutMs = 30000, intervalMs = 300 } = {}) => {
    const deadline = Date.now() + timeoutMs
    let lastError = null
    while (Date.now() < deadline) {
        try {
            const controller = new AbortController()
            const timer = setTimeout(() => controller.abort(), 2000)
            try {
                const res = await fetch(healthUrl, { signal: controller.signal })
                if (res.ok) return true
            } finally {
                clearTimeout(timer)
            }
        } catch (err) {
            lastError = err
        }
        await wait(intervalMs)
    }
    throw new Error(`timed out waiting for ${healthUrl}${lastError ? ` (${lastError.message})` : ''}`)
}

/**
 * POST/GET helper: returns { status, headers, json } and never throws on a
 * non-2xx status (a 409/400/403/413 is data to a black-box test, not a bug).
 * `body` may be a string (already-serialized, e.g. an oversize payload built
 * on purpose) or a plain object (JSON.stringify'd here).
 */
export const request = async (url, { method = 'GET', body, headers = {}, signal } = {}) => {
    const rawBody = body === undefined
        ? undefined
        : (typeof body === 'string' ? body : JSON.stringify(body))
    const res = await fetch(url, {
        method,
        headers: rawBody === undefined ? headers : { 'content-type': 'application/json', ...headers },
        body: rawBody,
        signal
    })
    const text = await res.text()
    let json = null
    try {
        json = text ? JSON.parse(text) : null
    } catch {
        json = null
    }
    return { status: res.status, headers: res.headers, text, json }
}

/** Sign a raw JSON body for a POST, when a room key is in play. */
export const signedHeaders = (key, rawBody) => (key ? { 'x-di-rig-sig': sign(key, rawBody) } : {})

/**
 * A tiny check-list accumulator shared by conformance.mjs and compat-grid.mjs.
 * `check(name, fn)` runs fn(), records PASS/FAIL/SKIP + detail, never throws.
 */
export const createChecklist = () => {
    const results = []
    const record = (name, status, detail = '') => { results.push({ name, status, detail }) }
    return {
        results,
        async check(name, fn) {
            try {
                const outcome = await fn()
                if (outcome && outcome.skip) {
                    record(name, 'SKIP', outcome.detail || '')
                } else if (outcome === false) {
                    record(name, 'FAIL', 'returned false')
                } else if (outcome && outcome.ok === false) {
                    record(name, 'FAIL', outcome.detail || '')
                } else {
                    record(name, 'PASS', (outcome && outcome.detail) || '')
                }
            } catch (err) {
                record(name, 'FAIL', String(err && err.message || err))
            }
        },
        summary() {
            const pass = results.filter(r => r.status === 'PASS').length
            const fail = results.filter(r => r.status === 'FAIL').length
            const skip = results.filter(r => r.status === 'SKIP').length
            return { pass, fail, skip, total: results.length }
        }
    }
}

/** Print a PASS/FAIL/SKIP table to stdout. */
export const printTable = (results, { title } = {}) => {
    const nameWidth = Math.max(4, ...results.map(r => r.name.length))
    const lines = []
    if (title) lines.push(title)
    for (const r of results) {
        const pad = r.name.padEnd(nameWidth, ' ')
        const detail = r.detail ? `  ${r.detail}` : ''
        lines.push(`  ${r.status.padEnd(4, ' ')}  ${pad}${detail}`)
    }
    process.stdout.write(`${lines.join('\n')}\n`)
}

export const jsonSize = (obj) => Buffer.byteLength(JSON.stringify(obj), 'utf8')
