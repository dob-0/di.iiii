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
const startMachineLink = ({ spaceId, link, hub, machine, log = console, syncEveryMs = SYNC_EVERY_MS, waitSeconds = WAIT_SECONDS, send = request }) => {
    let stopped = false
    const inflight = new Set()
    const timers = new Set()
    const via = viaLink(link.base)
    const spacePath = `/api/spaces/${encodeURIComponent(link.spaceId)}`
    const state = { synced: 0, delivered: 0, lastError: null }

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
        if (message !== state.lastError) log.warn?.(`[machines] ${spaceId}: ${message}`)
        state.lastError = message
    }

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
                    state.lastError = null
                    delay = syncEveryMs
                } else {
                    noteFailure('sync', answer)
                    delay = Math.min(delay * 2, BACKOFF_CEILING_MS)
                }
            } catch (error) {
                noteFailure('sync', { error: String(error?.message || error) })
                delay = Math.min(delay * 2, BACKOFF_CEILING_MS)
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
                    backoff = Math.min(Math.max(backoff * 2, 1000), BACKOFF_CEILING_MS)
                    pause = backoff
                }
            } catch (error) {
                noteFailure('signal', { error: String(error?.message || error) })
                backoff = Math.min(Math.max(backoff * 2, 1000), BACKOFF_CEILING_MS)
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
