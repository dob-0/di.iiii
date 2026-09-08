/**
 * A space that lives on two di.iiii at once.
 *
 * One artist hosts the space; another follows it from their own install. Both
 * hold the whole work on their own disk — this is replication, not a viewer —
 * and edits made on either side appear on the other.
 *
 * The transport is the op log over plain HTTP, in both directions, with the
 * receiving server's own opId dedupe as the safety net (see followPlan.js for
 * why that is enough). Socket.IO is deliberately NOT used: its handshake
 * resolves instance tokens only, a per-space sync key is the credential a
 * follower should hold, and a poll that backs off to twice a minute when the
 * room is quiet costs less than a socket that must be kept alive through a
 * venue's wifi.
 *
 * Everything this file does is refusable and repeatable. A follower that
 * cannot reach the other side does nothing and says so; it never invents state,
 * never deletes, and never writes a version it did not read.
 */

const { httpRequest } = require('../httpClient')
const { planDirection, planAfterConflict, nextInterval } = require('./followPlan')

const FLOOR_MS = 700
// Five seconds, not thirty. A followed space is a room with someone else in
// it: the cost of asking is one small GET, and the cost of not asking is the
// other person waiting half a minute to see what you just did. A local edit
// wakes the loop immediately (see wake()); only the OTHER side's edits ever
// wait this long.
const CEILING_MS = 5000
const TIMEOUT_MS = 8000
// How long the other side may hold our read open. Long enough that a quiet room
// costs almost nothing, short enough that a dropped wifi is noticed and said
// out loud rather than hanging forever.
const WAIT_SECONDS = 20
// Enough opIds to cover any batch several times over. Bounded because a room
// runs for days: the set is a courtesy to keep the wire quiet, and the servers'
// own dedupe is the correctness.
const SEEN_LIMIT = 5000

const rememberSeen = (seen, ops = []) => {
    for (const op of ops) {
        if (op?.opId) seen.add(op.opId)
    }
    if (seen.size > SEEN_LIMIT) {
        const excess = seen.size - SEEN_LIMIT
        let dropped = 0
        for (const id of seen) {
            seen.delete(id)
            if (++dropped >= excess) break
        }
    }
}

// Through httpClient (node:http/https), never global fetch: undici's WASM
// parser OOMs under the memory limits of the shared hosting the live site runs
// on, and that bug class has shipped here twice. httpContracts.test.js keeps it
// at zero, and this file is no exception for being new.
const request = async (url, { method = 'GET', token = null, body = null, timeoutMs = TIMEOUT_MS } = {}) => {
    const payloadBody = body ? JSON.stringify(body) : null
    try {
        const response = await httpRequest(url, {
            method,
            timeoutMs,
            headers: {
                Accept: 'application/json',
                ...(payloadBody ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payloadBody) } : {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: payloadBody
        })
        return { ok: response.ok, status: response.status, payload: response.json() }
    } catch (error) {
        return { ok: false, status: 0, payload: null, error: String(error?.message || error) }
    }
}

/**
 * One side of a followed space, addressed the same way whether it is across the
 * room or across the internet: a base URL, a space id, and a token.
 */
const side = ({ base, spaceId, token = null }) => ({
    base: String(base || '').replace(/\/$/, ''),
    spaceId,
    token,
    opsUrl(since) {
        const url = `${this.base}/api/spaces/${encodeURIComponent(this.spaceId)}/ops`
        return since === null || since === undefined ? url : `${url}?since=${encodeURIComponent(since)}`
    },
    writeUrl() {
        return `${this.base}/api/spaces/${encodeURIComponent(this.spaceId)}/ops`
    }
})

/**
 * Read the other side's new ops, holding the request open when there are none.
 *
 * `wait` is what makes a followed room feel like one room: instead of asking
 * again in a few seconds, the request parks on the other server and comes back
 * the instant someone there moves something. A server too old to know the
 * parameter simply answers straight away, and the loop falls back to its own
 * timing — so this is an improvement, never a requirement.
 */
const readOps = async (from, since, { waitSeconds = 0 } = {}) => {
    const url = waitSeconds > 0
        ? `${from.opsUrl(since)}${from.opsUrl(since).includes('?') ? '&' : '?'}wait=${waitSeconds}`
        : from.opsUrl(since)
    const answer = await request(url, { token: from.token, timeoutMs: (waitSeconds ? waitSeconds * 1000 : 0) + TIMEOUT_MS })
    if (!answer.ok) return { reachable: false, ops: [], latestVersion: null, status: answer.status }
    return {
        reachable: true,
        ops: Array.isArray(answer.payload?.ops) ? answer.payload.ops : [],
        latestVersion: Number.isFinite(answer.payload?.latestVersion) ? answer.payload.latestVersion : null
    }
}

/**
 * Carry ops one way. Returns what happened, in the caller's words rather than
 * HTTP's: how many landed, whether the target moved, and whether we are still
 * in step with it.
 */
const carry = async ({ from, to, ops, seen, targetVersion }) => {
    const plan = planDirection({ ops, seen, targetVersion })
    if (!plan) return { wrote: 0, targetVersion, moved: false }

    const answer = await request(to.writeUrl(), { method: 'POST', token: to.token, body: plan })
    if (answer.ok) {
        rememberSeen(seen, plan.ops)
        const newVersion = Number.isFinite(answer.payload?.newVersion) ? answer.payload.newVersion : targetVersion
        return { wrote: plan.ops.length, targetVersion: newVersion, moved: true }
    }

    if (answer.status === 409) {
        // Not an error: the other side is handing us the edits we had not seen
        // yet. Take them, and come back on the next tick with the new floor.
        const { apply, retryAt } = planAfterConflict(answer.payload)
        rememberSeen(seen, apply)
        return { wrote: 0, targetVersion: retryAt ?? targetVersion, moved: apply.length > 0, caughtUp: apply }
    }

    return { wrote: 0, targetVersion, moved: false, failed: answer.status || answer.error || 'unreachable' }
}

/**
 * Follow one space, both ways, until stopped.
 *
 * `onState` is called after every tick with a plain object a person could read:
 * this is what `di follows` prints and what the interface will show.
 */
const startFollowing = ({ local, remote, log = console, onState = () => {} }) => {
    const seen = new Set()
    let stopped = false
    let interval = FLOOR_MS
    let cursors = { localVersion: null, remoteVersion: null }
    let state = { status: 'starting', carriedIn: 0, carriedOut: 0, lastError: null, lastMoveAt: null }

    // Woken by this install's own writes, so an edit made here leaves at once
    // instead of waiting out whatever backoff the quiet had earned.
    let wakeNow = null
    const sleep = (ms) => new Promise((resolve) => {
        const timer = setTimeout(resolve, ms)
        wakeNow = () => { clearTimeout(timer); wakeNow = null; resolve() }
    })

    const tick = async () => {
        // The remote read parks; the local read never does — this install's own
        // writes wake the loop directly (nudgeFollow), and two parked requests
        // would just be two ways to sleep.
        const theirs = await readOps(remote, cursors.remoteVersion, { waitSeconds: WAIT_SECONDS })
        const ours = await readOps(local, cursors.localVersion)

        if (!theirs.reachable) {
            state = { ...state, status: 'waiting', lastError: `the other di.iiii is not answering (${theirs.status || 'no route'})` }
            return false
        }
        if (!ours.reachable) {
            state = { ...state, status: 'waiting', lastError: 'this install is not answering its own op log' }
            return false
        }

        // Their new ops go into us; ours go out to them. Each write is based on
        // the version of the side being written to — never the other one.
        const inbound = await carry({ from: remote, to: local, ops: theirs.ops, seen, targetVersion: ours.latestVersion })
        const outbound = await carry({ from: local, to: remote, ops: ours.ops, seen, targetVersion: theirs.latestVersion })

        cursors = {
            localVersion: inbound.targetVersion ?? ours.latestVersion,
            remoteVersion: outbound.targetVersion ?? theirs.latestVersion
        }
        rememberSeen(seen, theirs.ops)
        rememberSeen(seen, ours.ops)

        const failed = inbound.failed || outbound.failed || null
        const moved = inbound.moved || outbound.moved
        state = {
            status: failed ? 'waiting' : 'following',
            carriedIn: state.carriedIn + inbound.wrote,
            carriedOut: state.carriedOut + outbound.wrote,
            lastError: failed ? `a write was refused (${failed})` : null,
            lastMoveAt: moved ? Date.now() : state.lastMoveAt
        }
        return moved
    }

    const loop = async () => {
        while (!stopped) {
            let moved = false
            try {
                moved = await tick()
            } catch (error) {
                // A follower must never take the server down with it.
                state = { ...state, status: 'waiting', lastError: String(error?.message || error) }
                log.warn?.(`[follow] ${local.spaceId}: ${state.lastError}`)
            }
            onState({ spaceId: local.spaceId, remote: remote.base, ...state, cursors })
            interval = nextInterval({ moved, current: interval, floor: FLOOR_MS, ceiling: CEILING_MS })
            await sleep(interval)
        }
    }

    loop()
    return {
        stop() { stopped = true },
        wake() { interval = FLOOR_MS; wakeNow?.() },
        get state() { return { spaceId: local.spaceId, remote: remote.base, ...state, cursors } }
    }
}

module.exports = { side, readOps, carry, startFollowing, FLOOR_MS, CEILING_MS }
