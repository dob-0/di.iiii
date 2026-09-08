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
const { readFollows } = require('./followStore')

const running = new Map()

const selfBase = (port, basePath = '/serverXR') => `http://127.0.0.1:${port}${basePath}`

/**
 * @param {object} options
 * @param {string} options.dataDir      where follows.json lives
 * @param {number} options.port         this server's own port
 * @param {string} options.basePath     this server's mount path
 * @param {string|null} options.selfToken  a token that can write here (guest mode makes one)
 */
const startFollows = ({ dataDir, port, basePath = '/serverXR', selfToken = null, ensureSpace = null, log = console } = {}) => {
    const follows = readFollows(dataDir)
    for (const [spaceId, entry] of Object.entries(follows)) {
        if (running.has(spaceId)) continue
        const local = side({ base: selfBase(port, basePath), spaceId, token: selfToken })
        const remote = side({ base: entry.remote, spaceId: entry.spaceId || spaceId, token: entry.token })
        // The space has to exist here or every write lands on nothing. `di
        // follow` makes it when the install is running, but a follow written
        // while it was down — or restored from a backup onto a fresh machine —
        // would otherwise start and fail forever.
        Promise.resolve(ensureSpace?.(spaceId)).catch((error) => {
            log.warn?.(`[follow] ${spaceId}: could not make room for it here (${error?.message || error})`)
        })
        log.info?.(`[follow] ${spaceId} follows ${entry.remote}`)
        running.set(spaceId, startFollowing({ local, remote, log }))
    }
    return running
}

const stopFollows = () => {
    for (const follower of running.values()) follower.stop()
    running.clear()
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

module.exports = { startFollows, stopFollows, followStates, nudgeFollow, selfBase }
