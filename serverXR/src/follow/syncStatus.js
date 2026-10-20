/**
 * What the sync light on a space's top bar is told.
 *
 * One plain object per space, built from what is already known: the follower's
 * own state (follower.js), the machine link that learned the host's name
 * (machines/link.js), and — on the host — which machines have called in
 * (machines/hub.js). Nothing is measured here; this only chooses what to hand
 * over, and what NOT to: the follow's key never appears (the test for this file
 * fails if it does), and neither does anything about spaces other than this one.
 *
 * The words ("SYNCED", "NOT ANSWERING") are decided in the browser by
 * src/sync/syncLight.js, from these numbers. The server sends facts and a
 * timestamp (`now`) so a browser whose clock is off still counts from the
 * server's.
 */

/** A host's name for a person: what it called itself, else its address's first label. */
const hostNameOf = ({ linkHost, entry }) => {
    const named = linkHost?.name || entry?.label
    if (named) return String(named).slice(0, 80)
    try { return new URL(entry?.remote || '').hostname.split('.')[0] || null } catch { return null }
}

/** The remote address without anything a person did not type (path, query, credentials). */
const originOf = (remote) => {
    try {
        const url = new URL(remote)
        return `${url.protocol}//${url.host}`
    } catch { return null }
}

/**
 * @param {object} input
 * @param {string} input.spaceId
 * @param {object|null} input.follow     follower.js state for this space, or null
 * @param {object|null} input.entry      this space's entry in follows.json, or null (its token is never read)
 * @param {object|null} input.linkHost   { id, name } from machines/link.js, or null
 * @param {Array}  input.followers       hub.followersOf(spaceId): { machineId, name, seenAt }
 * @param {object|null} input.code       the live join code (no words): { id, expiresAt }
 * @param {number} input.now
 */
const buildSyncStatus = ({ spaceId, follow = null, entry = null, linkHost = null, followers = [], code = null, now = Date.now() }) => {
    const files = follow?.files || {}
    return {
        spaceId,
        now,
        follows: follow || entry ? {
            host: {
                name: hostNameOf({ linkHost, entry }),
                address: originOf(entry?.remote)
            },
            followedAt: entry?.followedAt || null,
            status: follow?.status || 'starting',
            hostAnswering: follow?.hostAnswering ?? null,
            hostRefused: Boolean(follow?.hostRefused),
            lastAnswerAt: follow?.lastAnswerAt ?? null,
            latencyMs: follow?.latencyMs ?? null,
            lastEditAt: follow?.lastMoveAt ?? null,
            // "Host's version kept" — each one is a time the two copies
            // disagreed and this install took the host's (SPEC_follow.md §2).
            clashes: follow?.converged ?? 0,
            lastClashAt: follow?.lastConvergeAt ?? null,
            clashTimes: Array.isArray(follow?.convergedAt) ? follow.convergedAt.slice(-100) : [],
            lastError: follow?.lastError ?? null,
            files: {
                pending: files.pending ?? 0,
                failed: files.failed ?? 0,
                carried: files.carried ?? 0,
                bytesPending: files.bytesPending ?? 0
            }
        } : null,
        followers: followers.map((one) => ({ machineId: one.machineId, name: one.name || null, seenAt: one.seenAt })),
        code: code ? { id: code.id, expiresAt: code.expiresAt } : null
    }
}

module.exports = { buildSyncStatus, hostNameOf, originOf }
