/**
 * The follower's half of the door between two machines.
 *
 * The host cannot reach a follower — it does not know its address, and a
 * laptop on a venue's wifi has none worth knowing. So the follower does all the
 * reaching, for every space it follows, with the same remote base and sync key
 * the follow itself uses:
 *
 *   - every few seconds it tells the host which tabs are here, and learns which
 *     tabs are there (POST /machines/sync);
 *   - it holds a request open on the host for messages addressed to its tabs
 *     (GET /signal?server=<this machine>), and drops each one into the mailbox
 *     of the tab it is for.
 *
 * Messages the other way need nothing from this loop: a tab here posts to its
 * own server, which forwards straight to the host (routes.js).
 *
 * In-process on this side: the hub is right here, so this loop never calls its
 * own server over HTTP. Nothing in it may take the server down; every failure
 * backs off and tries again, and the loop ends when the follow does.
 */

const { httpRequest } = require('../httpClient')
const { readFollows } = require('../follow/followStore')
const { viaLink } = require('./hub')

const SYNC_EVERY_MS = 3000
const BACKOFF_CEILING_MS = 30_000
// The host answered and REFUSED this machine's key (401/403): asking again in 30 s
// will not change its mind. Each loop waits 30 s, then 1, 2, 4 … at most 10 min,
// and it is said once, in the log and in this link's state (DSC-9, aylmo
// 2026-10-26: a 401 said 40 times in 10 min, the two loops each asking).
const REFUSED_CEILING_MS = 10 * 60_000
const REFUSED = new Set([401, 403])
const WAIT_SECONDS = 20
const TIMEOUT_MS = 8000

const request = async (url, { method = 'GET', token = null, body = null, timeoutMs = TIMEOUT_MS, signal = null, servername = null, address = null } = {}) => {
    const text = body ? JSON.stringify(body) : null
    try {
        const response = await httpRequest(url, {
            method,
            timeoutMs,
            signal,
            servername,
            address,
            headers: {
                Accept: 'application/json',
                ...(text ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) } : {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: text
        })
        return { ok: response.ok, status: response.status, payload: response.json() }
    } catch (error) {
        return { ok: false, status: 0, payload: null, error: String(error?.message || error) }
    }
}

/**
 * Keep one followed space's machines in touch with the host, until stopped.
 *
 * @param {object} options
 * @param {string} options.spaceId        the space's id HERE
 * @param {object} options.link           { base, spaceId (on the host), token, servername?, address? }
 * @param {object} options.hub            this server's machine hub
 * @param {() => {id, name}} options.machine
 */
const startMachineLink = ({ spaceId, link, hub, machine, log = console, syncEveryMs = SYNC_EVERY_MS, waitSeconds = WAIT_SECONDS, send = request, backoffCeilingMs = BACKOFF_CEILING_MS, refusedCeilingMs = REFUSED_CEILING_MS }) => {
    let stopped = false
    const inflight = new Set()
    const timers = new Set()
    const via = viaLink(link.base)
    const spacePath = `/api/spaces/${encodeURIComponent(link.spaceId)}`
    // `host` is who answered: the host's own id and name, which it sends back
    // on every sync — the sync light says "PONYO", not an address.
    // `refused`: the host refuses this machine's key — { status, since }, said once.
    const state = { synced: 0, delivered: 0, lastError: null, host: null, refused: null }
    // Each loop's own last failure. One shared field made the two loops' messages
    // differ every time, so a repeating failure was "new" and logged each time.
    const lastErrors = { sync: null, signal: null }
    const refusedBy = new Set() // the loops whose last answer was a refusal

    hub.setLink(spaceId, link)

    const sleep = (ms) => new Promise((resolve) => {
        const timer = setTimeout(() => { timers.delete(timer); resolve() }, ms)
        timers.add(timer)
    })

    const call = async (path, options = {}) => {
        const controller = new AbortController()
        inflight.add(controller)
        try {
            return await send(`${link.base}${path}`, { token: link.token, servername: link.servername || null, address: link.address || null, signal: controller.signal, ...options })
        } finally {
            inflight.delete(controller)
        }
    }

    const noteFailure = (what, answer) => {
        const message = `${what}: ${answer.status || answer.error || 'unreachable'}`
        if (REFUSED.has(answer.status)) {
            refusedBy.add(what)
            if (!state.refused) {
                state.refused = { status: answer.status, since: Date.now() }
                log.warn?.(`[machines] ${spaceId}: the host refuses this machine's key (${answer.status}) — asking again less often, at most every ${Math.round(refusedCeilingMs / 60_000)} min`)
            }
        } else {
            refusedBy.delete(what)
            if (!refusedBy.size) state.refused = null
            if (message !== lastErrors[what]) log.warn?.(`[machines] ${spaceId}: ${message}`)
        }
        lastErrors[what] = message
        state.lastError = message
    }
    const noteSuccess = (what) => {
        lastErrors[what] = null
        refusedBy.delete(what)
        if (!refusedBy.size) state.refused = null
        state.lastError = lastErrors.sync || lastErrors.signal
    }
    // The next wait after a failure: a refusal waits far longer than a silence.
    const nextDelay = (delay, answer) => (REFUSED.has(answer?.status)
        ? Math.min(Math.max(delay * 2, backoffCeilingMs), refusedCeilingMs)
        : Math.min(Math.max(delay * 2, 1000), backoffCeilingMs))

    const syncLoop = async () => {
        let delay = syncEveryMs
        while (!stopped) {
            try {
                const answer = await call(`${spacePath}/machines/sync`, {
                    method: 'POST',
                    body: { machine: machine(), peers: hub.localPeers(spaceId) }
                })
                if (stopped) break
                if (answer.ok) {
                    hub.recordRemotePeers(spaceId, via, Array.isArray(answer.payload?.peers) ? answer.payload.peers : [])
                    state.synced += 1
                    if (answer.payload?.machine?.id) state.host = { id: answer.payload.machine.id, name: answer.payload.machine.name || null }
                    noteSuccess('sync')
                    delay = syncEveryMs
                } else {
                    noteFailure('sync', answer)
                    delay = nextDelay(delay, answer)
                }
            } catch (error) {
                noteFailure('sync', { error: String(error?.message || error) })
                delay = nextDelay(delay, null)
            }
            if (!stopped) await sleep(delay)
        }
    }

    const mailLoop = async () => {
        let backoff = 0
        while (!stopped) {
            const startedAt = Date.now()
            let pause = 0
            try {
                const id = encodeURIComponent(machine().id)
                const answer = await call(`${spacePath}/signal?server=${id}&wait=${waitSeconds}`, {
                    timeoutMs: waitSeconds * 1000 + TIMEOUT_MS
                })
                if (stopped) break
                if (answer.ok) {
                    backoff = 0
                    noteSuccess('signal')
                    const messages = Array.isArray(answer.payload?.messages) ? answer.payload.messages : []
                    for (const message of messages) {
                        // Only to a tab that is still here. A tab that closed
                        // has no mailbox to fill, and a message for anyone else
                        // was not ours to take.
                        if (!hub.isLocal(spaceId, message?.to)) continue
                        hub.deliver(spaceId, message.to, message)
                        state.delivered += 1
                    }
                    // A host that answers a held request at once, every time,
                    // would turn this into a spin.
                    if (!messages.length && Date.now() - startedAt < 200) pause = 1000
                } else {
                    noteFailure('signal', answer)
                    backoff = nextDelay(backoff, answer)
                    pause = backoff
                }
            } catch (error) {
                noteFailure('signal', { error: String(error?.message || error) })
                backoff = nextDelay(backoff, null)
                pause = backoff
            }
            if (pause && !stopped) await sleep(pause)
        }
    }

    syncLoop()
    mailLoop()

    return {
        link,
        stop() {
            if (stopped) return
            stopped = true
            for (const controller of inflight) controller.abort()
            for (const timer of timers) clearTimeout(timer)
            timers.clear()
            hub.forgetLink(spaceId)
        },
        get state() { return { spaceId, remote: link.base, ...state } }
    }
}

const running = new Map()

const sameLink = (a, b) => a.base === b.base && a.spaceId === b.spaceId && a.token === b.token && a.address === b.address

/**
 * One link per followed space, matched to follows.json each time it is called
 * — the same rhythm as startFollows, from the same watch on the same file.
 */
const startMachineLinks = ({ dataDir, hub, machine, log = console, follows = null } = {}) => {
    const wanted = follows || readFollows(dataDir)
    for (const [spaceId, entry] of Object.entries(wanted)) {
        const link = {
            base: String(entry?.remote || '').replace(/\/$/, ''),
            spaceId: entry?.spaceId || spaceId,
            token: entry?.token || null,
            // The ADDRESS PIN written by `di follow --at` — carried onto the
            // machine-sync link too, so a followed room's tabs reach the host
            // the same way its op log does.
            address: entry?.address || null
        }
        const current = running.get(spaceId)
        if (current && sameLink(current.link, link)) continue
        current?.stop()
        running.delete(spaceId)
        if (!link.base) continue
        running.set(spaceId, startMachineLink({ spaceId, link, hub, machine, log }))
    }
    for (const [spaceId, current] of running) {
        if (wanted[spaceId]) continue
        current.stop()
        running.delete(spaceId)
    }
    return running
}

const stopMachineLinks = () => {
    for (const current of running.values()) current.stop()
    running.clear()
}

const machineLinkStates = () => [...running.values()].map(current => current.state)

module.exports = { startMachineLink, startMachineLinks, stopMachineLinks, machineLinkStates, SYNC_EVERY_MS }
