/**
 * Wiring: start a follower for every space this install follows, and expose
 * what they are doing.
 *
 * Started after the server is listening, because a follower talks to this very
 * server over HTTP — the same routes a browser uses, with the same locks,
 * validation and broadcast. Replication that wrote to the database directly
 * would be a second way for state to change, and the first thing to drift.
 */

const { startFollowing, side } = require('./follower')
const { readFollows, readFollowState, writeFollowState, clearDirection } = require('./followStore')

const running = new Map()
// The direction each running follower was started with. A new one in
// follows.json (the person ran `di follow … --take-host`) restarts that
// follower; it resumes from its saved cursors, so a restart loses nothing.
const startedWith = new Map()
// What each running follower was started with besides the direction: where it
// follows, with which key, through which address pin, from where it starts. A
// different one in follows.json (the person ran `di follow` again on an
// existing follow, with a new key) restarts that follower, the same way; before
// 2026-10-05 only a new direction did, so a new key was written to follows.json
// and never used until the next restart of the whole install.
const startedKey = new Map()

/** The part of a follows.json entry a running follower is built from (not its direction, which has its own rule). */
const entryKey = (spaceId, entry) => JSON.stringify([spaceId, entry.spaceId || spaceId, entry.remote || null, entry.token || null, entry.address || null, entry.start === 'replay' ? 'replay' : 'now'])

// A server with a certificate speaks https and nothing else, so reaching itself
// over http got no answer and a follow on that install never wrote a thing.
// `tlsName` is the certificate's name: the follower still connects to loopback
// and checks the certificate against that name (see httpClient's servername).
const selfBase = (port, basePath = '/serverXR', tlsName = null) => `${tlsName ? 'https' : 'http'}://127.0.0.1:${port}${basePath}`

/**
 * @param {object} options
 * @param {string} options.dataDir      where follows.json lives
 * @param {number} options.port         this server's own port
 * @param {string} options.basePath     this server's mount path
 * @param {string|null} options.selfToken  a token that can write here (guest mode makes one)
 * @param {string|null} options.tlsName    the certificate's name when this server speaks https
 * @param {object} options.files        { maxBytes, tmpDir } for the files a follow carries (follow/assets.js)
 */
const startFollows = ({ dataDir, port, basePath = '/serverXR', selfToken = null, tlsName = null, ensureSpace = null, files = {}, log = console, starter = startFollowing } = {}) => {
    const follows = readFollows(dataDir)
    // Called again whenever follows.json changes, so `di follow` and `di
    // unfollow` take effect on a running install — they used to wait for the
    // next restart, while the CLI said the edits were already travelling.
    for (const [spaceId, follower] of running) {
        if (follows[spaceId]) continue
        follower.stop()
        running.delete(spaceId)
        startedWith.delete(spaceId)
        startedKey.delete(spaceId)
        log.info?.(`[follow] ${spaceId} no longer followed`)
    }
    for (const [spaceId, follower] of [...running]) {
        if (!follows[spaceId] || startedKey.get(spaceId) === entryKey(spaceId, follows[spaceId])) continue
        // Never says the key itself, only that something about the follow changed.
        follower.stop()
        running.delete(spaceId)
        startedWith.delete(spaceId)
        startedKey.delete(spaceId)
        log.info?.(`[follow] ${spaceId}: its entry in follows.json changed (remote, key or address) — restarting it with the new one`)
    }
    for (const [spaceId, follower] of [...running]) {
        const wanted = follows[spaceId]?.direction || null
        if (wanted && wanted !== startedWith.get(spaceId)) {
            follower.stop()
            running.delete(spaceId)
            log.info?.(`[follow] ${spaceId}: restarting to apply --${wanted}`)
        }
    }
    for (const [spaceId, entry] of Object.entries(follows)) {
        if (running.has(spaceId)) continue
        const local = side({ base: selfBase(port, basePath, tlsName), spaceId, token: selfToken, servername: tlsName })
        // entry.address is the ADDRESS PIN written by `di follow --at` — the
        // name in entry.remote keeps doing its job, the socket goes here.
        const remote = side({ base: entry.remote, spaceId: entry.spaceId || spaceId, token: entry.token, address: entry.address || null })
        // The space has to exist here or every write lands on nothing. `di
        // follow` makes it when the install is running, but a follow written
        // while it was down — or restored from a backup onto a fresh machine —
        // would otherwise start and fail forever.
        Promise.resolve(ensureSpace?.(spaceId)).catch((error) => {
            log.warn?.(`[follow] ${spaceId}: could not make room for it here (${error?.message || error})`)
        })
        log.info?.(`[follow] ${spaceId} follows ${entry.remote}`)
        running.set(spaceId, starter({
            local, remote, log, files,
            // Resume where this follow had got to; save as it goes (followStore.js).
            saved: readFollowState(dataDir, spaceId),
            onSave: (state) => writeFollowState(dataDir, spaceId, state),
            // First start: from now, unless the follow asked to replay (follower.js).
            start: entry.start === 'replay' ? 'replay' : 'now',
            direction: entry.direction || null,
            onDirectionDone: () => { startedWith.delete(spaceId); return clearDirection(dataDir, spaceId) }
        }))
        startedWith.set(spaceId, entry.direction || null)
        startedKey.set(spaceId, entryKey(spaceId, entry))
    }
    return running
}

const stopFollows = () => {
    for (const follower of running.values()) follower.stop()
    running.clear()
    startedWith.clear()
    startedKey.clear()
}

/**
 * Tell the follower for a space that something just changed here.
 *
 * Called by the write routes after a commit. Without it an edit made on this
 * machine waits out the backoff the quiet had earned — up to five seconds of a
 * person wondering whether the other screen is broken.
 */
const nudgeFollow = (spaceId) => {
    running.get(spaceId)?.wake?.()
}

/** What every follower is doing, for `di follows` and for the interface. */
const followStates = () => [...running.values()].map(follower => follower.state)

// The lease that says whether THIS server carries the follows of its data
// folder (lease.js). Set by index.js; absent in tests that drive startFollows
// directly, which then read as carrying — as every server did before.
let lease = null
const setFollowLease = (next) => { lease = next }

/**
 * Who carries this data folder's follows, for GET /api/follows and `di follows`.
 * On a server that does not, says so plainly and names the one that does.
 */
const followCarrier = () => {
    if (!lease || lease.held) return { carriedHere: true }
    const holder = lease.holder()
    return {
        carriedHere: false,
        carriedBy: holder ? { pid: holder.pid, port: holder.port, hostname: holder.hostname, heartbeatAt: holder.heartbeatAt } : null,
        message: lease.describe()
    }
}

module.exports = { startFollows, stopFollows, followStates, followCarrier, setFollowLease, nudgeFollow, selfBase }
