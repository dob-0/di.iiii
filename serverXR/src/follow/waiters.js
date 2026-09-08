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
 * Deliberately small: no state, no history, no ordering. Everything true about
 * what changed is already in the op log; this only says "look again now".
 */

const waiting = new Map()

/**
 * Wait until this space changes, or until the timeout. Resolves `true` when
 * woken by a write, `false` when the wait simply ran out — the caller answers
 * the same way either way, with whatever the log holds.
 */
const waitForChange = (spaceId, timeoutMs) => new Promise((resolve) => {
    if (!spaceId || !Number.isFinite(timeoutMs) || timeoutMs <= 0) return resolve(false)

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
})

/** A write landed: release everyone waiting on this space. */
const noteChange = (spaceId) => {
    const bucket = waiting.get(spaceId)
    if (!bucket) return 0
    const count = bucket.size
    for (const done of [...bucket]) done(true)
    return count
}

/** How many requests are parked on a space — for tests and for `di follows`. */
const waitingCount = (spaceId) => waiting.get(spaceId)?.size || 0

module.exports = { waitForChange, noteChange, waitingCount }
