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

/** Whether a batch contained a whole-work op we refused to carry. */
const refusedWholeWork = (ops = []) => ops.some(op => WHOLE_WORK_OPS.has(op?.type))

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

module.exports = { BATCH, WHOLE_WORK_OPS, unseen, moreToCarry, refusedWholeWork, planDirection, planAfterConflict, nextInterval }
