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
    let devices = []
    let stopped = false
    let helloTimer = null
    let controller = null

    const setPeers = (next) => {
        peers = Array.isArray(next) ? next : []
        for (const listener of peerListeners) listener(peers, machine)
    }

    const hello = async () => {
        try {
            const answer = await apiFetch(`${base}/machines/hello`, { method: 'POST', body: { peerId, role, devices } })
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

    // A page that just opened on the other machine is not known here until its
    // server's next sync (every few seconds), and the answer to its first
    // message is usually faster than that. Found 2026-09-14: asuz answered a
    // new page's first request in 0.1s with its WebRTC offer, got "no such
    // peer", and the offer was never sent again — the picture stayed dark
    // forever while every later, smaller message arrived. So a 404 waits and
    // tries again; anything else is final.
    const RETRY_404_MS = [800, 1600, 2400, 3200]
    const sendWithRetry = async (to, payload) => {
        for (let attempt = 0; ; attempt += 1) {
            try {
                return await apiFetch(`${base}/signal`, { method: 'POST', body: { from: peerId, to, payload } })
            } catch (error) {
                if (stopped || error?.status !== 404 || attempt >= RETRY_404_MS.length) return null
                await new Promise((resolve) => setTimeout(resolve, RETRY_404_MS[attempt]))
            }
        }
    }

    hello().then(() => { if (!stopped) listen() })
    helloTimer = setInterval(hello, HELLO_EVERY_MS)

    return {
        peerId,
        get machine() { return machine },
        get peers() { return peers },
        send: (to, payload) => sendWithRetry(to, payload),
        onMessage: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
        onPeers: (listener) => { peerListeners.add(listener); listener(peers, machine); return () => peerListeners.delete(listener) },
        /** What this machine has; told to the others on the next hello, which is now. */
        setDevices: (next) => { devices = Array.isArray(next) ? next : []; hello() },
        stop() {
            stopped = true
            clearInterval(helloTimer)
            controller?.abort()
            listeners.clear()
            peerListeners.clear()
        }
    }
}

// One link per space per page. The editor's runner, the Desk panel and the
// projector page all ask for it; one peer answers for the page, so the other
// machines see one page, not three.
const shared = new Map()
export const acquireMachineLink = (spaceId) => {
    let entry = shared.get(spaceId)
    if (!entry) {
        entry = { link: createMachineLink({ spaceId, role: 'runner' }), count: 0 }
        shared.set(spaceId, entry)
    }
    entry.count += 1
    let released = false
    return {
        link: entry.link,
        release() {
            if (released) return
            released = true
            entry.count -= 1
            if (entry.count > 0) return
            // A moment's grace: a component that remounts (a route change, a
            // strict-mode double effect) keeps the same peer instead of leaving
            // a ghost page on the other machine for thirty seconds.
            setTimeout(() => {
                if (entry.count > 0 || shared.get(spaceId) !== entry) return
                entry.link.stop()
                shared.delete(spaceId)
            }, 1500)
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
export const machinesIn = (peers, self, selfDevices = []) => {
    const byId = new Map()
    if (self?.id) byId.set(self.id, { id: self.id, name: self.name || 'this machine', self: true, devices: selfDevices, pages: 1 })
    for (const peer of peers || []) {
        if (!peer.machineId) continue
        const known = byId.get(peer.machineId)
        if (known) {
            if (known.self) continue
            known.pages += 1
            // Two pages on one machine may see different things (a camera
            // unplugged between them); the union is what the machine has.
            for (const device of peer.devices || []) {
                if (!known.devices.some((d) => d.kind === device.kind && (d.id === device.id || (d.label && d.label === device.label)))) known.devices.push(device)
            }
            continue
        }
        byId.set(peer.machineId, { id: peer.machineId, name: peer.machineName || peer.machineId.slice(0, 8), self: false, devices: [...(peer.devices || [])], pages: 1 })
    }
    return [...byId.values()]
}
