/**
 * "Tell me when this space changes" — a place for a reader to wait.
 *
 * A follower on another machine asks for a space's new ops. If nothing is new,
 * polling again in a second is wasteful and polling again in five is slow: the
 * artist on the other side sees their own edit crawl across. So the request
 * WAITS here, and the write that commits the next op wakes it — one held HTTP
 * request instead of a socket, which is what a per-space sync key can carry and
 * what survives a venue's wifi.
 *
 * Deliberately small: one counter per space, no history, no ordering. Everything true about
 * what changed is already in the op log; this only says "look again now".
 */

const waiting = new Map()

// How many writes each space has had since this process started, behind a
// name for the process — a "change mark". A reader that hands back the mark
// it was last given is answered at once if the space has changed since, even
// though nobody was parked at the moment of the write. Without it a wake is a
// shout into an empty space: a follower reads the projects, the host writes,
// THEN the follower parks on the scene's log — and sits out the whole wait for
// an edit that was already there (measured 2026-10-04: 20s, every time, for
// the edit made right after a carry). The same latch a blocking query keeps
// with its index (Consul's `?index=`, etcd's watch revision). In memory on
// purpose: a restart changes the name, every old mark stops matching, and the
// worst a stale mark costs is one answer that comes back at once.
//
// Counted only for keys a reader has asked a mark for — the spaces whose scene log
// is read — so the machine hub's per-mailbox keys never pile up in here.
const changes = new Map()
const EPOCH = `${process.pid.toString(36)}${Date.now().toString(36)}`

const markOf = (spaceId) => `${EPOCH}.${changes.get(spaceId) || 0}`

/**
 * The space's current change mark, for a reader to hand back next time. From
 * here on the space's writes are counted. The caller hands one out only for a
 * space that exists, so a stranger asking about made-up names adds nothing.
 */
const changeMark = (spaceId) => {
    if (!changes.has(spaceId)) changes.set(spaceId, 0)
    return markOf(spaceId)
}

// A held request costs a socket, a timer and a closure for as long as it is
// held, and on a public space anyone may ask. Capped per space so a single
// caller cannot pin the process: over the cap the request is answered at once
// with whatever the log holds, which is exactly what the caller's contract
// already tolerates.
const MAX_WAITERS = 32

/**
 * Wait until this space changes, or until the timeout. Resolves `true` when
 * woken by a write, `false` when the wait simply ran out — the caller answers
 * the same way either way, with whatever the log holds.
 *
 * `mark` is a change mark this reader was given earlier. If the space has
 * changed since, there is nothing to wait for: resolves `true` at once.
 */
const waitForChange = (spaceId, timeoutMs, { signal = null, mark = null } = {}) => new Promise((resolve) => {
    if (!spaceId || !Number.isFinite(timeoutMs) || timeoutMs <= 0) return resolve(false)
    if (typeof mark === 'string' && mark && mark !== markOf(spaceId)) return resolve(true)
    if ((waiting.get(spaceId)?.size || 0) >= MAX_WAITERS) return resolve(false)

    const bucket = waiting.get(spaceId) || new Set()
    waiting.set(spaceId, bucket)

    const done = (changed) => {
        clearTimeout(timer)
        bucket.delete(done)
        if (!bucket.size) waiting.delete(spaceId)
        resolve(changed)
    }
    const timer = setTimeout(() => done(false), timeoutMs)
    bucket.add(done)
    // A caller that hung up is not waiting for anything. Without this an
    // abandoned request keeps its place until the timeout, and a client that
    // retries in a loop fills the cap with ghosts.
    if (signal) {
        if (signal.aborted) return done(false)
        signal.addEventListener('abort', () => done(false), { once: true })
    }
})

/** A write landed: release everyone waiting on this space. */
const noteChange = (spaceId) => {
    if (changes.has(spaceId)) changes.set(spaceId, changes.get(spaceId) + 1)
    const bucket = waiting.get(spaceId)
    if (!bucket) return 0
    const count = bucket.size
    for (const done of [...bucket]) done(true)
    return count
}

/** How many requests are parked on a space — for tests and for `di follows`. */
const waitingCount = (spaceId) => waiting.get(spaceId)?.size || 0

module.exports = { waitForChange, noteChange, changeMark, waitingCount, MAX_WAITERS }
