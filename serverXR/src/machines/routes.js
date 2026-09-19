/**
 * The HTTP face of the machine hub: tabs say hello, send signals and collect
 * them; a follower server syncs who is where and collects what is for its tabs.
 *
 * Every route here is editor-only on its space, GET included. The rest of the
 * space API lets anyone read a PUBLIC space; a mailbox is not the space, and a
 * visitor must not be able to read or drain the handshakes of the people
 * editing it. A per-space sync key is an editor on exactly that space, so the
 * follower's own credential is what opens these on the host. With auth off (a
 * local install) the check passes, as it does everywhere else.
 */

const { httpRequest } = require('../httpClient')
const { viaFollower, isPeerId, serverKey } = require('./hub')

const MAX_WAIT_SECONDS = 25
const FORWARD_TIMEOUT_MS = 8000
// A relay that forwards to a server that forwards back is a loop. One hop is
// the whole design (follower → host); a little room for a chain, no more.
const MAX_HOPS = 3

const readWait = (value) => {
    const seconds = Number(value)
    if (!Number.isFinite(seconds) || seconds <= 0) return 0
    return Math.min(seconds, MAX_WAIT_SECONDS)
}

/**
 * The default way to hand a signal to the server this install follows.
 * Through httpClient, never global fetch — see follow/follower.js for why.
 */
const forwardOverHttp = async (link, body) => {
    const text = JSON.stringify(body)
    try {
        const response = await httpRequest(`${link.base}/api/spaces/${encodeURIComponent(link.spaceId)}/signal`, {
            method: 'POST',
            timeoutMs: FORWARD_TIMEOUT_MS,
            servername: link.servername || null,
            address: link.address || null,
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(text),
                ...(link.token ? { Authorization: `Bearer ${link.token}` } : {})
            },
            body: text
        })
        return { status: response.status, payload: response.json() }
    } catch (error) {
        return { status: 0, payload: null, error: String(error?.message || error) }
    }
}

/**
 * @param {import('express').Router} router
 * @param {object} deps
 * @param {ReturnType<import('./hub').createMachineHub>} deps.hub
 * @param {() => {id: string, name: string}} deps.machine  this server's identity
 * @param {() => boolean} deps.requireAuth
 * @param {(req) => object} deps.getAuthState
 * @param {(role: string, required: string) => boolean} deps.hasRequiredAuthRole
 * @param {(state: object, spaceId: string) => boolean} deps.canAccessSpace
 * @param {(spaceId: string) => string|null} deps.normalizeSpaceId
 * @param {(spaceId: string) => Promise<boolean>} [deps.spaceExists]
 * @param {(link, body) => Promise<{status, payload}>} [deps.forward]
 */
function registerMachineRoutes(router, {
    hub,
    machine,
    requireAuth = () => false,
    getAuthState = (req) => req.authState || {},
    hasRequiredAuthRole = () => false,
    canAccessSpace = () => false,
    normalizeSpaceId = (value) => value,
    spaceExists = null,
    forward = forwardOverHttp
}) {
    const requireSpaceEditor = async (req, res, next) => {
        try {
            const spaceId = normalizeSpaceId(req.params.spaceId)
            if (!spaceId) return res.status(400).json({ error: 'Invalid space id.' })
            if (requireAuth()) {
                const state = getAuthState(req) || {}
                if (!state.authenticated) return res.status(401).json({ error: 'Unauthorized', requiredRole: 'editor' })
                if (!hasRequiredAuthRole(state.role, 'editor')) {
                    return res.status(403).json({ error: 'Editor role required.', requiredRole: 'editor' })
                }
                if (!canAccessSpace(state, spaceId)) {
                    return res.status(403).json({ error: 'Space access denied.', requiredSpaceId: spaceId })
                }
            }
            if (spaceExists && !(await spaceExists(spaceId))) {
                return res.status(404).json({ error: 'Space not found.' })
            }
            req.machineSpaceId = spaceId
            next()
        } catch (error) {
            next(error)
        }
    }

    const holdOpen = async (req, spaceId, key, seconds) => {
        let messages = hub.drain(spaceId, key)
        if (messages.length || seconds <= 0) return messages
        const closed = new AbortController()
        req.on('close', () => closed.abort())
        await hub.wait(spaceId, key, seconds * 1000, { signal: closed.signal })
        messages = hub.drain(spaceId, key)
        return messages
    }

    router.post('/api/spaces/:spaceId/machines/hello', requireSpaceEditor, (req, res) => {
        const spaceId = req.machineSpaceId
        const me = machine()
        const { peerId, role = null, devices = [] } = req.body || {}
        const result = hub.hello(spaceId, { peerId, role, devices, machine: me })
        if (result.error) return res.status(result.status).json({ error: result.error })
        res.json({ machine: me, peers: hub.listPeers(spaceId) })
    })

    router.get('/api/spaces/:spaceId/machines', requireSpaceEditor, (req, res) => {
        res.json({ machine: machine(), peers: hub.listPeers(req.machineSpaceId) })
    })

    router.post('/api/spaces/:spaceId/machines/sync', requireSpaceEditor, (req, res) => {
        const spaceId = req.machineSpaceId
        const me = machine()
        const caller = req.body?.machine || {}
        if (!isPeerId(caller.id)) return res.status(400).json({ error: 'machine.id is required' })
        if (caller.id === me.id) return res.status(409).json({ error: 'a machine cannot follow itself' })
        const callerName = typeof caller.name === 'string' && caller.name.trim() ? caller.name.trim().slice(0, 80) : caller.id
        const via = viaFollower(caller.id)
        // Every peer a follower reports is one of ITS tabs, by contract — so the
        // machine is the caller's, whatever the entries claim.
        const peers = (Array.isArray(req.body?.peers) ? req.body.peers : []).map(peer => ({
            peerId: peer?.peerId,
            role: peer?.role ?? null,
            machineId: caller.id,
            machineName: callerName
        }))
        hub.noteServer(spaceId, caller.id)
        hub.recordRemotePeers(spaceId, via, peers)
        res.json({ machine: me, peers: hub.listPeers(spaceId, { excludeVia: via, excludeMachineId: caller.id }) })
    })

    router.post('/api/spaces/:spaceId/signal', requireSpaceEditor, async (req, res, next) => {
        try {
            const spaceId = req.machineSpaceId
            const { from, to, payload } = req.body || {}
            const hops = Number.isInteger(req.body?.hops) && req.body.hops > 0 ? req.body.hops : 0
            if (!isPeerId(from) || !isPeerId(to)) return res.status(400).json({ error: 'from and to must be peer ids' })
            const size = hub.checkPayload(payload)
            if (size.error) return res.status(size.status).json({ error: size.error })

            hub.touch(spaceId, from)
            const target = hub.route(spaceId, to)
            if (!target) return res.status(404).json({ error: 'no such peer' })

            if (target.kind === 'local' || target.kind === 'server') {
                hub.deliver(spaceId, target.key, { from, to, payload })
                return res.json({ ok: true, delivered: target.kind === 'local' ? 'local' : 'queued' })
            }

            if (!target.link) return res.status(404).json({ error: 'no such peer' })
            if (hops >= MAX_HOPS) return res.status(508).json({ error: 'too many hops' })
            const answer = await forward(target.link, { from, to, payload, hops: hops + 1 })
            if (answer.status >= 200 && answer.status < 300) {
                return res.json({ ok: true, delivered: 'forwarded' })
            }
            if (!answer.status) return res.status(502).json({ error: 'the other di.iiii is not answering' })
            res.status(answer.status).json(answer.payload && typeof answer.payload === 'object'
                ? answer.payload
                : { error: 'the other di.iiii refused the signal' })
        } catch (error) {
            next(error)
        }
    })

    router.get('/api/spaces/:spaceId/signal', requireSpaceEditor, async (req, res, next) => {
        try {
            const spaceId = req.machineSpaceId
            const seconds = readWait(req.query.wait)
            const server = req.query.server
            if (typeof server === 'string' && server) {
                if (!isPeerId(server)) return res.status(400).json({ error: 'server must be a machine id' })
                hub.noteServer(spaceId, server)
                const messages = await holdOpen(req, spaceId, serverKey(server), seconds)
                // Held for up to 25s: the follower's mailbox must not lapse
                // while it is the one holding the request.
                hub.noteServer(spaceId, server)
                return res.json({ messages })
            }
            const peer = req.query.peer
            if (!isPeerId(peer)) return res.status(400).json({ error: 'peer or server is required' })
            if (!hub.touch(spaceId, peer)) return res.status(404).json({ error: 'no such peer' })
            const messages = await holdOpen(req, spaceId, peer, seconds)
            hub.touch(spaceId, peer)
            res.json({ messages })
        } catch (error) {
            next(error)
        }
    })
}

module.exports = { registerMachineRoutes, forwardOverHttp, MAX_WAIT_SECONDS, MAX_HOPS }
