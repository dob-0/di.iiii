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
const { moreToCarry, planDirection, planAfterConflict, nextInterval, refusedWholeWork } = require('./followPlan')
const { projectIdsFrom, sceneStream, streamsFor } = require('./streams')

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
    url(path) { return `${this.base}${path}` },
    opsUrl(stream, since) {
        const url = this.url(stream.opsPath)
        return since === null || since === undefined ? url : `${url}?since=${encodeURIComponent(since)}`
    },
    writeUrl(stream) { return this.url(stream.writePath) }
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
const readOps = async (from, stream, since, { waitSeconds = 0 } = {}) => {
    const plain = from.opsUrl(stream, since)
    const url = waitSeconds > 0
        ? `${plain}${plain.includes('?') ? '&' : '?'}wait=${waitSeconds}`
        : plain
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
const carry = async ({ to, stream, ops, seen, targetVersion }) => {
    const plan = planDirection({ ops, seen, targetVersion })
    if (!plan) return { wrote: 0, targetVersion, moved: false }

    const answer = await request(to.writeUrl(stream), { method: 'POST', token: to.token, body: plan })
    if (answer.ok) {
        rememberSeen(seen, plan.ops)
        const newVersion = Number.isFinite(answer.payload?.newVersion) ? answer.payload.newVersion : targetVersion
        // A write that landed but changed nothing (every op already known — the
        // receiving server dedupes by opId) is not movement. Counting it as
        // movement pinned the loop at its floor forever and made `di follows`
        // report work being carried when none was.
        const landed = Array.isArray(answer.payload?.ops) ? answer.payload.ops.length : plan.ops.length
        return {
            wrote: landed,
            targetVersion: newVersion,
            moved: landed > 0,
            // The version of the last op we actually took from the SOURCE. The
            // source cursor may only advance this far: a batch is capped, and
            // advancing to "everything that existed when we read" would skip
            // every op past the cap — permanently, silently, and on the very
            // first tick of a follow with history.
            carriedThrough: plan.ops[plan.ops.length - 1]?.version ?? null
        }
    }

    if (answer.status === 409) {
        // Not an error: the other side is handing us the edits we had not seen
        // yet. Take them, and come back on the next tick with the new floor.
        const { apply, retryAt } = planAfterConflict(answer.payload)
        rememberSeen(seen, apply)
        return { wrote: 0, targetVersion: retryAt ?? targetVersion, moved: apply.length > 0, caughtUp: apply, carriedThrough: null }
    }

    return { wrote: 0, targetVersion, moved: false, carriedThrough: null, failed: answer.status || answer.error || 'unreachable' }
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
    // One cursor pair per stream — the room's own log and every project in it.
    // Keyed by stream, because a project's version counter has nothing to do
    // with the room's, and both have nothing to do with the other machine's.
    const cursors = new Map()
    let streams = [sceneStream(local.spaceId)]
    let state = { status: 'starting', carriedIn: 0, carriedOut: 0, streams: 1, lastError: null, lastMoveAt: null }

    // Woken by this install's own writes, so an edit made here leaves at once
    // instead of waiting out whatever backoff the quiet had earned.
    let wakeNow = null
    const sleep = (ms) => new Promise((resolve) => {
        const timer = setTimeout(resolve, ms)
        wakeNow = () => { clearTimeout(timer); wakeNow = null; resolve() }
    })

    const cursorFor = (stream) => cursors.get(stream.key) || { localVersion: null, remoteVersion: null }

    /** The projects on both sides, so a project made on either appears on both. */
    const refreshStreams = async () => {
        const path = `/api/spaces/${encodeURIComponent(local.spaceId)}/projects`
        const [here, there] = await Promise.all([
            request(local.url(path), { token: local.token }),
            request(remote.url(path), { token: remote.token })
        ])
        const localProjects = projectIdsFrom(here.payload)
        const remoteProjects = projectIdsFrom(there.payload)

        // A project that exists only there has to exist here before its ops can
        // land. Made through this server's own route, with the same id: ids are
        // global in di.iiii, so the same project is the same project on both
        // machines.
        for (const projectId of remoteProjects) {
            if (localProjects.includes(projectId)) continue
            const made = await request(local.url(path), {
                method: 'POST', token: local.token, body: { slug: projectId, title: projectId }
            })
            if (!made.ok && made.status !== 409) {
                log.warn?.(`[follow] ${local.spaceId}: could not make room for ${projectId} (${made.status})`)
            }
        }
        streams = streamsFor({ spaceId: local.spaceId, localProjects, remoteProjects })
    }

    /** Carry one stream, both ways. */
    const runStream = async (stream, { wait = false } = {}) => {
        const cursor = cursorFor(stream)
        const theirs = await readOps(remote, stream, cursor.remoteVersion, { waitSeconds: wait ? WAIT_SECONDS : 0 })
        const ours = await readOps(local, stream, cursor.localVersion)

        // A project one side does not have yet is a 404 on that stream, not a
        // failure of the follow: it will exist on the next pass.
        if (!theirs.reachable) {
            if (theirs.status === 404) return { moved: false, skipped: true }
            return { moved: false, failed: `the other di.iiii is not answering (${theirs.status || 'no route'})` }
        }
        if (!ours.reachable) {
            if (ours.status === 404) return { moved: false, skipped: true }
            return { moved: false, failed: 'this install is not answering its own op log' }
        }

        const inbound = await carry({ to: local, stream, ops: theirs.ops, seen, targetVersion: ours.latestVersion })
        const outbound = await carry({ to: remote, stream, ops: ours.ops, seen, targetVersion: theirs.latestVersion })

        // Each cursor advances only as far as the ops that side actually gave
        // up: the remote cursor to the last remote op we carried IN, the local
        // cursor to the last local op we carried OUT. When a batch was capped
        // the rest is read again on the next tick, which is why the loop does
        // not sleep while there is more to carry.
        const more = moreToCarry(theirs.ops, seen) || moreToCarry(ours.ops, seen)
        cursors.set(stream.key, {
            localVersion: outbound.carriedThrough ?? (ours.ops.length ? cursor.localVersion : ours.latestVersion),
            remoteVersion: inbound.carriedThrough ?? (theirs.ops.length ? cursor.remoteVersion : theirs.latestVersion)
        })
        rememberSeen(seen, theirs.ops.slice(0, 0))

        return {
            moved: inbound.moved || outbound.moved,
            more,
            carriedIn: inbound.wrote,
            carriedOut: outbound.wrote,
            // A whole-work op sat in the log and was left there deliberately.
            // Said out loud, because silence would look like everything crossed.
            refused: refusedWholeWork(theirs.ops) || refusedWholeWork(ours.ops),
            failed: inbound.failed || outbound.failed || null
        }
    }

    const tick = async () => {
        await refreshStreams()

        let parked = false
        let moved = false
        let more = false
        let refused = false
        let carriedIn = 0
        let carriedOut = 0
        let failed = null

        // The room's own log parks on the other side (that is what makes a
        // followed room feel like one room); the project logs are asked
        // straight out, so one quiet project cannot hold up the rest.
        // Projects first, the room last: the last stream is the one that parks.
        const ordered = [...streams.slice(1), streams[0]]
        for (const [index, stream] of ordered.entries()) {
            if (stopped) break
            // The room's own log parks on the other side — that is what makes
            // a followed room feel like one room. It is read LAST so the
            // projects, which never park, are already carried when we settle
            // into the wait.
            const willPark = index === ordered.length - 1
            const result = await runStream(stream, { wait: willPark })
            if (willPark) parked = true
            if (result.skipped) continue
            moved = moved || result.moved
            more = more || result.more
            refused = refused || result.refused
            carriedIn += result.carriedIn || 0
            carriedOut += result.carriedOut || 0
            failed = failed || result.failed
        }

        state = {
            status: failed ? 'waiting' : (more ? 'catching up' : 'following'),
            carriedIn: state.carriedIn + carriedIn,
            carriedOut: state.carriedOut + carriedOut,
            streams: streams.length,
            lastError: failed
                || (refused ? 'one side replaced a whole scene — that is not carried by a follow; use di sync' : null),
            lastMoveAt: moved ? Date.now() : state.lastMoveAt
        }
        // Still behind: go round again at once. A capped batch that slept would
        // trickle a long history across at one batch per tick.
        return { moved, parked: parked && !more, more }
    }

    const loop = async () => {
        while (!stopped) {
            let moved = false
            let parked = false
            const startedAt = Date.now()
            try {
                ({ moved, parked } = await tick())
            } catch (error) {
                // A follower must never take the server down with it.
                state = { ...state, status: 'waiting', lastError: String(error?.message || error) }
                log.warn?.(`[follow] ${local.spaceId}: ${state.lastError}`)
            }
            onState({ spaceId: local.spaceId, remote: remote.base, ...state })
            // A tick that PARKED has already done its waiting on the other
            // machine, and came back because something moved there — go round
            // again at once rather than sleeping through the thing we were
            // woken for. The elapsed check keeps a server that answers a park
            // instantly (an old one that ignores `wait`) from becoming a spin.
            const elapsed = Date.now() - startedAt
            interval = parked && elapsed > 200
                ? 0
                : nextInterval({ moved, current: interval, floor: FLOOR_MS, ceiling: CEILING_MS })
            if (interval > 0) await sleep(interval)
        }
    }

    loop()
    return {
        stop() { stopped = true },
        wake() { interval = FLOOR_MS; wakeNow?.() },
        get state() { return { spaceId: local.spaceId, remote: remote.base, ...state } }
    }
}

module.exports = { side, readOps, carry, startFollowing, FLOOR_MS, CEILING_MS }
