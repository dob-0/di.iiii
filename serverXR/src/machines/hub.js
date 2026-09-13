/**
 * Who is in a space, on which machine, and what is waiting for them.
 *
 * Two di.iiii that share a space through a follow are two rooms with one door
 * between them. A browser tab can only speak to its own server, so when a tab on
 * one machine wants to reach a tab on the other (WebRTC signalling: an offer, an
 * answer, a candidate), the servers carry the message. This is the part that
 * holds it while it waits.
 *
 * In memory, per space, and deliberately forgetful: a peer that has not been
 * seen for PEER_TTL_MS is gone, a mailbox holds at most MAX_MESSAGES, and
 * nothing here survives a restart. Signalling is only ever worth something for
 * a few seconds; a tab that reloads says hello again.
 *
 * The routing rule, for a message addressed to a peer:
 *   - the peer is a tab on THIS server          → its own mailbox
 *   - the peer lives on the server we follow    → forward to that server now
 *     (we can reach it; it cannot reach us)
 *   - the peer lives on a server that follows us → the mailbox of that server,
 *     which it drains with a held request of its own
 */

const crypto = require('node:crypto')
const { waitForChange, noteChange } = require('../follow/waiters')

const PEER_TTL_MS = 30_000
const MAX_PEERS = 50
const MAX_MESSAGES = 200
const MAX_PAYLOAD_BYTES = 64 * 1024

const LOCAL = 'local'
const FOLLOWER_VIA = 'link:follower:'
const LINK_VIA = 'link:'

const ID_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/

const isPeerId = (value) => typeof value === 'string' && ID_PATTERN.test(value)
const cleanText = (value, max) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null)

const viaFollower = (machineId) => `${FOLLOWER_VIA}${machineId}`
const viaLink = (remoteBase) => `${LINK_VIA}${remoteBase}`
const serverKey = (machineId) => `server:${machineId}`

const createMachineHub = ({
    now = () => Date.now(),
    peerTtlMs = PEER_TTL_MS,
    maxPeers = MAX_PEERS,
    maxMessages = MAX_MESSAGES,
    maxPayloadBytes = MAX_PAYLOAD_BYTES
} = {}) => {
    // Held requests park in the shared waiter table (follow/waiters.js) under a
    // key no space id can spell, so an op write never wakes a signal read and
    // two hubs in one process (tests) never wake each other.
    const instance = crypto.randomUUID()
    const spaces = new Map()
    // The server this install follows, per space: where to forward to.
    const links = new Map()

    const spaceFor = (spaceId, create = false) => {
        let space = spaces.get(spaceId)
        if (!space && create) {
            space = { peers: new Map(), mailboxes: new Map(), servers: new Map() }
            spaces.set(spaceId, space)
        }
        return space || null
    }

    const waitKey = (spaceId, key) => `machines|${instance}|${spaceId}|${key}`

    /** Forget peers nobody has seen, and every mailbox nobody can drain. */
    const prune = (spaceId) => {
        const space = spaces.get(spaceId)
        if (!space) return null
        const at = now()
        for (const [peerId, peer] of space.peers) {
            if (at - peer.seenAt > peerTtlMs) space.peers.delete(peerId)
        }
        for (const [machineId, seenAt] of space.servers) {
            if (at - seenAt > peerTtlMs) space.servers.delete(machineId)
        }
        for (const key of space.mailboxes.keys()) {
            const owner = key.startsWith('server:')
                ? space.servers.has(key.slice('server:'.length))
                : space.peers.get(key)?.via === LOCAL
            if (!owner) space.mailboxes.delete(key)
        }
        if (!space.peers.size && !space.mailboxes.size && !space.servers.size) {
            spaces.delete(spaceId)
            return null
        }
        return space
    }

    const publicPeer = (peer) => ({
        peerId: peer.peerId,
        machineId: peer.machineId,
        machineName: peer.machineName,
        role: peer.role,
        seenAt: peer.seenAt,
        via: peer.via
    })

    /**
     * A tab on this server says it is here. Refreshes a peer that already is.
     * @returns {{ peer } | { error, status }}
     */
    const hello = (spaceId, { peerId, role = null, machine }) => {
        if (!isPeerId(peerId)) return { error: 'peerId must be 1-128 letters, digits, _ . : -', status: 400 }
        prune(spaceId)
        const space = spaceFor(spaceId, true)
        if (!space.peers.has(peerId) && space.peers.size >= maxPeers) {
            return { error: 'too many peers in this space', status: 429 }
        }
        const peer = {
            peerId,
            machineId: machine.id,
            machineName: machine.name,
            role: cleanText(role, 40),
            seenAt: now(),
            via: LOCAL
        }
        space.peers.set(peerId, peer)
        return { peer: publicPeer(peer) }
    }

    /** A local peer is still here (it asked for its mail). */
    const touch = (spaceId, peerId) => {
        const peer = spaceFor(spaceId)?.peers.get(peerId)
        if (!peer || peer.via !== LOCAL) return false
        peer.seenAt = now()
        return true
    }

    const isLocal = (spaceId, peerId) => {
        prune(spaceId)
        return spaceFor(spaceId)?.peers.get(peerId)?.via === LOCAL
    }

    const listPeers = (spaceId, { excludeVia = null, excludeMachineId = null } = {}) => {
        const space = prune(spaceId)
        if (!space) return []
        return [...space.peers.values()]
            .filter(peer => peer.via !== excludeVia && (!excludeMachineId || peer.machineId !== excludeMachineId))
            .map(publicPeer)
    }

    const localPeers = (spaceId) => listPeers(spaceId).filter(peer => peer.via === LOCAL)

    /**
     * Replace everything learned through one route (`via`) with what that route
     * says now. A peer that left the other machine disappears here on the next
     * sync, not thirty seconds later. A tab of our own is never overwritten by
     * a rumour about it.
     */
    const recordRemotePeers = (spaceId, via, peers = []) => {
        if (!via || via === LOCAL) return 0
        prune(spaceId)
        const space = spaceFor(spaceId, true)
        const incoming = new Map()
        for (const raw of Array.isArray(peers) ? peers : []) {
            if (!isPeerId(raw?.peerId) || !isPeerId(raw?.machineId)) continue
            incoming.set(raw.peerId, raw)
        }
        for (const [peerId, peer] of space.peers) {
            if (peer.via === via && !incoming.has(peerId)) space.peers.delete(peerId)
        }
        let recorded = 0
        for (const raw of incoming.values()) {
            const existing = space.peers.get(raw.peerId)
            if (existing?.via === LOCAL) continue
            if (!existing && space.peers.size >= maxPeers) break
            space.peers.set(raw.peerId, {
                peerId: raw.peerId,
                machineId: raw.machineId,
                machineName: cleanText(raw.machineName, 80) || raw.machineId,
                role: cleanText(raw.role, 40),
                seenAt: now(),
                via
            })
            recorded += 1
        }
        if (!space.peers.size && !space.mailboxes.size && !space.servers.size) spaces.delete(spaceId)
        return recorded
    }

    /** A follower server called in — its mailbox stays alive while it does. */
    const noteServer = (spaceId, machineId) => {
        if (!isPeerId(machineId)) return false
        spaceFor(spaceId, true).servers.set(machineId, now())
        return true
    }

    /**
     * Where a message for `to` has to go.
     * @returns {null | { kind: 'local', key } | { kind: 'server', key, machineId } | { kind: 'forward', link, remote }}
     */
    const route = (spaceId, to) => {
        const peer = prune(spaceId)?.peers.get(to)
        if (!peer) return null
        if (peer.via === LOCAL) return { kind: 'local', key: peer.peerId }
        if (peer.via.startsWith(FOLLOWER_VIA)) {
            const machineId = peer.via.slice(FOLLOWER_VIA.length)
            return { kind: 'server', key: serverKey(machineId), machineId }
        }
        return { kind: 'forward', link: links.get(spaceId) || null, remote: peer.via.slice(LINK_VIA.length) }
    }

    /** Bytes the payload takes on the wire, or null when it is not JSON. */
    const payloadBytes = (payload) => {
        if (payload === undefined) return null
        try {
            return Buffer.byteLength(JSON.stringify(payload))
        } catch {
            return null
        }
    }

    /** @returns {{ ok: true } | { error, status }} */
    const checkPayload = (payload) => {
        const bytes = payloadBytes(payload)
        if (bytes === null) return { error: 'payload must be JSON', status: 400 }
        if (bytes > maxPayloadBytes) return { error: `payload is over ${maxPayloadBytes} bytes`, status: 413 }
        return { ok: true }
    }

    /** Leave a message in a mailbox and wake whoever is waiting on it. */
    const deliver = (spaceId, key, { from, to, payload, at = now() }) => {
        const space = spaceFor(spaceId, true)
        const box = space.mailboxes.get(key) || []
        box.push({ from, to, payload, at })
        // Oldest out: a candidate from a minute ago is worth less than the
        // offer that just arrived.
        if (box.length > maxMessages) box.splice(0, box.length - maxMessages)
        space.mailboxes.set(key, box)
        noteChange(waitKey(spaceId, key))
        return box.length
    }

    /** Take everything waiting in a mailbox. */
    const drain = (spaceId, key) => {
        const space = spaceFor(spaceId)
        const box = space?.mailboxes.get(key)
        if (!box?.length) return []
        space.mailboxes.delete(key)
        return box
    }

    /** Resolves when a message lands in this mailbox, or after `ms`. */
    const wait = (spaceId, key, ms, { signal = null } = {}) => waitForChange(waitKey(spaceId, key), ms, { signal })

    const setLink = (spaceId, link) => { links.set(spaceId, link) }
    const linkFor = (spaceId) => links.get(spaceId) || null

    /** The follow ended: forget where to forward, and everyone we heard of there. */
    const forgetLink = (spaceId) => {
        const link = links.get(spaceId)
        links.delete(spaceId)
        if (link?.base) recordRemotePeers(spaceId, viaLink(link.base), [])
    }

    return {
        hello,
        touch,
        isLocal,
        listPeers,
        localPeers,
        recordRemotePeers,
        noteServer,
        route,
        checkPayload,
        deliver,
        drain,
        wait,
        setLink,
        linkFor,
        forgetLink
    }
}

module.exports = {
    createMachineHub,
    isPeerId,
    viaFollower,
    viaLink,
    serverKey,
    PEER_TTL_MS,
    MAX_PEERS,
    MAX_MESSAGES,
    MAX_PAYLOAD_BYTES
}
