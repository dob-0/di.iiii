// This page's place in a space shared across machines.
//
// A page cannot talk to another machine's server (one is https on a
// certificate, the other plain http, and a browser refuses the mix), so every
// message goes through THIS page's own server, which relays it along the link
// the two installs already share for sync. See serverXR/src/machines.
//
//   hello     every few seconds: "a page of mine is here, doing <role>"
//   peers     every page on every linked machine, with that machine's name
//   send      a message to one page, on whichever machine it is
//   listen    a long-poll that hands over each message addressed to this page
//
// Only signalling travels this way — offers, answers, candidates, "I want that
// picture". The pictures themselves go browser to browser (picturePeers.js).

import { apiFetch } from '../../services/apiClient.js'

const HELLO_EVERY_MS = 5000
const WAIT_SECONDS = 20
const RETRY_MS = 3000

const newPeerId = () => (
    globalThis.crypto?.randomUUID?.() || `peer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
)

/**
 * @param {object} options
 * @param {string} options.spaceId
 * @param {string} [options.role]   'runner' for a page that runs picture operators
 */
export const createMachineLink = ({ spaceId, role = 'runner' }) => {
    const peerId = newPeerId()
    const base = `/api/spaces/${encodeURIComponent(spaceId)}`
    const listeners = new Set()
    const peerListeners = new Set()
    let machine = null
    let peers = []
    let stopped = false
    let helloTimer = null
    let controller = null

    const setPeers = (next) => {
        peers = Array.isArray(next) ? next : []
        for (const listener of peerListeners) listener(peers, machine)
    }

    const hello = async () => {
        try {
            const answer = await apiFetch(`${base}/machines/hello`, { method: 'POST', body: { peerId, role } })
            machine = answer?.machine || machine
            setPeers(answer?.peers)
        } catch {
            // The server may be restarting, or older than this page. Try again
            // on the next beat; a page that cannot link still runs locally.
        }
    }

    const listen = async () => {
        while (!stopped) {
            controller = new AbortController()
            try {
                const answer = await apiFetch(`${base}/signal?peer=${encodeURIComponent(peerId)}&wait=${WAIT_SECONDS}`, { signal: controller.signal })
                for (const message of answer?.messages || []) {
                    for (const listener of listeners) listener(message)
                }
            } catch {
                if (stopped) return
                await new Promise((resolve) => setTimeout(resolve, RETRY_MS))
            }
        }
    }

    hello().then(() => { if (!stopped) listen() })
    helloTimer = setInterval(hello, HELLO_EVERY_MS)

    return {
        peerId,
        get machine() { return machine },
        get peers() { return peers },
        send: (to, payload) => apiFetch(`${base}/signal`, { method: 'POST', body: { from: peerId, to, payload } }).catch(() => null),
        onMessage: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
        onPeers: (listener) => { peerListeners.add(listener); listener(peers, machine); return () => peerListeners.delete(listener) },
        stop() {
            stopped = true
            clearInterval(helloTimer)
            controller?.abort()
            listeners.clear()
            peerListeners.clear()
        }
    }
}

/** The page on `machineId` that runs operators, most recently seen first. */
export const runnerOn = (peers, machineId, selfPeerId = null) => (
    (peers || [])
        .filter((peer) => peer.machineId === machineId && peer.role === 'runner' && peer.peerId !== selfPeerId)
        .sort((a, b) => (b.seenAt || 0) - (a.seenAt || 0))[0] || null
)

/** Every machine a space can see, this one first, each once. */
export const machinesIn = (peers, self) => {
    const byId = new Map()
    if (self?.id) byId.set(self.id, { id: self.id, name: self.name || 'this machine', self: true })
    for (const peer of peers || []) {
        if (!peer.machineId || byId.has(peer.machineId)) continue
        byId.set(peer.machineId, { id: peer.machineId, name: peer.machineName || peer.machineId.slice(0, 8), self: false })
    }
    return [...byId.values()]
}
