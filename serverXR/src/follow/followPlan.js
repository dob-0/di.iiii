/**
 * What a follower should do next — decided here, with no I/O, so the rule can
 * be read and tested without two servers running.
 *
 * A followed space is one space living on two di.iiii at once: an artist's own
 * install and someone else's (or the hosted site). Both sides keep the whole
 * work on their own disk; what crosses the wire is the op log.
 *
 * Three facts about that log make this safe, and every rule below rests on
 * them:
 *
 *   1. every op carries an `opId` minted by whoever made the edit, and a write
 *      route DROPS ops whose opId it already holds. So an op that travels back
 *      to where it came from is a no-op, and a retry after a lost answer is
 *      free. This is what lets both directions run without a token or a
 *      leader.
 *
 *   2. `version` is a per-install counter. The same op is version 8 here and
 *      version 3491 there, so the two numbers must never be compared — each
 *      side is followed by its OWN cursor, and the pairing between them lives
 *      only in this follower's memory.
 *
 *   3. a write states the version it is based on and is refused with 409 plus
 *      the ops it missed. So a conflict is not an error to report to a person:
 *      it is the other side handing us exactly what we need to catch up and try
 *      again.
 */

const { CONVERGE_CLIENT } = require('./followConverge')

/** How many ops we will carry in one direction per tick. */
const BATCH = 200

/**
 * The ops from `theirs` that this side has not seen, in order.
 *
 * `seen` holds the opIds this follower has already carried in EITHER direction.
 * Without it the pair still converges — the receiving server drops the
 * duplicate — but every op would make one pointless round trip forever, and a
 * quiet room would never stop talking.
 */
// `replaceScene` is not an edit. It is the whole work, overwritten, and it
// appears in the log whenever someone restores a snapshot or pulls a scene from
// another tier. Carried across a follow it would silently make one artist's
// copy of the room become the other's, with no snapshot and no way back — the
// exact act syncRoutes.js exists to make deliberate and reversible. A follow
// carries edits; a whole-scene replacement is a conversation between people.
const WHOLE_WORK_OPS = new Set(['replaceScene', 'replaceDocument'])

const unseen = (ops = [], seen = new Set()) => ops
    .filter(op => op && op.opId && !seen.has(op.opId) && !WHOLE_WORK_OPS.has(op.type))
    .slice(0, BATCH)

/** Did we stop short of the end — i.e. is there more to carry right now? */
const moreToCarry = (ops = [], seen = new Set()) => ops
    .filter(op => op && op.opId && !seen.has(op.opId) && !WHOLE_WORK_OPS.has(op.type))
    .length > BATCH

/**
 * Whether a batch contained a whole-work op we refused to carry. The follower's
 * own convergence write (followConverge.js) is a whole-work op too, but it is
 * not someone replacing the room: it is this follower agreeing with the host.
 */
const refusedWholeWork = (ops = []) => ops.some(op => WHOLE_WORK_OPS.has(op?.type) && op?.clientId !== CONVERGE_CLIENT)

/**
 * The next move for one direction.
 *
 * Returns null when there is nothing to do, so a caller can stay silent — a
 * follower that writes on every tick is a follower that fills a disk overnight.
 */
const planDirection = ({ ops = [], seen = new Set(), targetVersion = null } = {}) => {
    const carry = unseen(ops, seen)
    if (!carry.length) return null
    if (targetVersion === null || targetVersion === undefined) return null
    return { baseVersion: targetVersion, ops: carry }
}

/**
 * What to do after a write was refused as out of date.
 *
 * The refusal carries `latestVersion` and `pendingOps` — the ops we were
 * missing. Applying those first is both the fix and the point: they are the
 * other side's edits, which we wanted anyway.
 */
const planAfterConflict = (conflict = {}) => ({
    apply: Array.isArray(conflict.pendingOps) ? conflict.pendingOps : [],
    retryAt: Number.isFinite(conflict.latestVersion) ? conflict.latestVersion : null
})

/**
 * How long to wait before asking again.
 *
 * Quiet rooms must cost nothing: the interval grows while nothing moves and
 * drops to the floor the moment either side does. A person dragging an object
 * sees the other screen follow within the floor interval; a laptop left open
 * overnight asks twice a minute.
 */
const nextInterval = ({ moved, current, floor = 700, ceiling = 30000 }) => {
    if (moved) return floor
    return Math.min(ceiling, Math.max(floor, Math.round((current || floor) * 1.6)))
}

/**
 * How far a cursor may move: through every op we have accounted for, in order,
 * stopping at the first we have not.
 *
 * "Accounted for" is carried OR already known — an op we sent to the other side
 * comes back in their log, and if that did not advance the cursor the same op
 * would be re-read on every tick forever. Measured: a single edit each way left
 * both cursors pinned and both servers polled continuously for the life of the
 * follow. Contiguous on purpose: a gap must hold the cursor back, or the ops
 * inside it are lost.
 */
const accountedThrough = (ops = [], accounted = new Set(), fallback = null) => {
    let through = null
    for (const op of ops) {
        if (!op?.opId || !accounted.has(op.opId)) return through
        if (Number.isFinite(op.version)) through = op.version
    }
    return ops.length ? (through ?? fallback) : fallback
}

/*
 * A write the other side REFUSES with a server error is not a network blip.
 * On 2026-10-02 every write into project `test` answered 500 (its database had
 * ops above its version), and the follower sent the same batch again on every
 * tick — every ~25 s, for hours — while `di follows` said only "500". Now a
 * stream whose write fails with a server error is left alone for a while that
 * doubles each time (5 s, 10 s, 20 s … at most 5 min), the other streams keep
 * moving, and the error is a sentence naming the project.
 */
const FAILURE_FLOOR_MS = 5000
const FAILURE_CEILING_MS = 5 * 60 * 1000

/** How long to leave a stream alone after its `count`-th failure in a row. */
const failureDelay = (count, { floor = FAILURE_FLOOR_MS, ceiling = FAILURE_CEILING_MS } = {}) =>
    Math.min(ceiling, floor * 2 ** Math.max(0, (Number(count) || 1) - 1))

/** Is this refusal one that sending the same thing again cannot get past? */
const isStuckRefusal = (status) => Number.isInteger(status) && status >= 500

/**
 * What a person reads when a write was refused — in `di follows` and the log.
 * Names the project (or the room), the direction, and the server's own words.
 */
const describeWriteFailure = ({ stream, direction, status, error = null, retryInMs = null }) => {
    const what = stream?.kind === 'project' ? `project ${stream.projectId || String(stream.key || '').replace(/^project:/, '')}` : `the room ${String(stream?.key || '').replace(/^scene:/, '') || ''}`.trim()
    const who = direction === 'in' ? 'this di.iiii refused the other side\'s changes to' : 'the other di.iiii refused this side\'s changes to'
    const code = status ? `HTTP ${status}` : 'no answer'
    const words = error ? `: ${String(error).slice(0, 200)}` : ''
    const later = retryInMs ? ` — trying again in ${Math.round(retryInMs / 1000)} s; the rest of the space keeps following` : ''
    const look = direction === 'in' && isStuckRefusal(status) ? ' (see this server\'s log)' : ''
    return `${who} ${what} (${code}${words})${look}${later}`
}

module.exports = { BATCH, WHOLE_WORK_OPS, accountedThrough, unseen, moreToCarry, refusedWholeWork, planDirection, planAfterConflict, nextInterval, failureDelay, isStuckRefusal, describeWriteFailure, FAILURE_FLOOR_MS, FAILURE_CEILING_MS }
