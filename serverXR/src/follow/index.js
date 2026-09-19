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
const startFollows = ({ dataDir, port, basePath = '/serverXR', selfToken = null, tlsName = null, ensureSpace = null, files = {}, log = console } = {}) => {
    const follows = readFollows(dataDir)
    // Called again whenever follows.json changes, so `di follow` and `di
    // unfollow` take effect on a running install — they used to wait for the
    // next restart, while the CLI said the edits were already travelling.
    for (const [spaceId, follower] of running) {
        if (follows[spaceId]) continue
        follower.stop()
        running.delete(spaceId)
        log.info?.(`[follow] ${spaceId} no longer followed`)
    }
    for (const [spaceId, entry] of Object.entries(follows)) {
        if (running.has(spaceId)) continue
        const local = side({ base: selfBase(port, basePath, tlsName), spaceId, token: selfToken, servername: tlsName })
        const remote = side({ base: entry.remote, spaceId: entry.spaceId || spaceId, token: entry.token })
        // The space has to exist here or every write lands on nothing. `di
        // follow` makes it when the install is running, but a follow written
        // while it was down — or restored from a backup onto a fresh machine —
        // would otherwise start and fail forever.
        Promise.resolve(ensureSpace?.(spaceId)).catch((error) => {
            log.warn?.(`[follow] ${spaceId}: could not make room for it here (${error?.message || error})`)
        })
        log.info?.(`[follow] ${spaceId} follows ${entry.remote}`)
        running.set(spaceId, startFollowing({ local, remote, log, files }))
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
