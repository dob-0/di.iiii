import { useEffect, useState } from 'react'

// THE DECK'S LIVE LINE between windows on one machine.
//
// A deck writes its state through the ordinary op layer, and that stays the record. But the op layer goes through the
// server: on a real show deck one round trip measured about 0.4 s, and a wall that only hears the server shows every
// clip launch and fader move late (Platina, 2026-11-13: "the output does not match"). The map desk already has a
// courier for its own edits (src/map/mapCourier.js); this is the deck's.
//
// The deck page says its newest deck here the moment it writes it. A wall page on the same origin draws from that
// instead of from its document while the line is fresh, so ops that arrive later and older cannot roll the picture
// back. Nothing is stored and nothing is written: a wall that never hears the line is late, not wrong.
//
// WHEN THE DECK GOES QUIET. After HOLD_MS without a word the entry is STALE, not gone. It used to be dropped, and the
// wall drew its document again, "which by then has caught up". On the night the saves hung (a third page had taken
// the browser's last connection to the server) it had not: every launch showed for 3 s and then the wall went back
// to the last picture the server knew, and a HOLD key whose release was not saved came back on by itself.
// A stale entry still wins while the document holds a deck this wall has already been told about: the one it had
// while the line was fresh, or any deck the line said (a save that arrives late is one of those). It loses to a deck
// the line never said, which is somebody else's write (another machine, a tool), and it is dropped when the deck
// page says goodbye (closed or reloaded: what that page shows next is the stored deck).
export const DECK_LIVE_HOLD_MS = 3000
const SAID_MAX = 4096

// One number for a deck's content (FNV-1a over its JSON), kept per object so a document is hashed once.
const hashes = new WeakMap()
export const deckHash = (deck) => {
    if (!deck || typeof deck !== 'object') return 0
    const known = hashes.get(deck)
    if (known !== undefined) return known
    let text = ''
    try { text = JSON.stringify(deck) } catch { text = '' }
    let h = 0x811c9dc5
    for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) }
    const hash = (h >>> 0) * 4096 + (text.length % 4096)
    hashes.set(deck, hash)
    return hash
}
const remember = (said, hash) => {
    if (!said) return
    said.delete(hash) // again = newest
    said.add(hash)
    if (said.size > SAID_MAX) said.delete(said.values().next().value)
}
export const deckLiveChannel = (projectId) => `di-deck-live-${projectId}`

const senders = new Map()
const senderFor = (projectId) => {
    if (!projectId || typeof BroadcastChannel === 'undefined') return null
    if (!senders.has(projectId)) senders.set(projectId, new BroadcastChannel(deckLiveChannel(projectId)))
    return senders.get(projectId)
}

/** Say this deck's newest state to the other windows of this origin. Never throws. */
export const postDeckLive = (projectId, nodeId, deck) => {
    if (!nodeId || !deck) return false
    try {
        const channel = senderFor(projectId)
        if (!channel) return false
        channel.postMessage({ kind: 'deck', nodeId, deck, at: Date.now() })
        return true
    } catch {
        return false
    }
}

/** The deck page is going (closed, reloaded, its deck view taken down): the walls go back to the stored deck. */
export const postDeckBye = (projectId, nodeId) => {
    if (!nodeId) return false
    try {
        const channel = senderFor(projectId)
        if (!channel) return false
        channel.postMessage({ kind: 'bye', nodeId, at: Date.now() })
        return true
    } catch {
        return false
    }
}

/**
 * The document with each live deck in place of the stored one; the same object when nothing is live.
 * A fresh entry always wins, and the stored deck it wins over is remembered. A stale entry wins only while the stored
 * deck is one it remembers (see the top of the file).
 */
export const overlayDeckLive = (document, live) => {
    if (!document || !live || !Object.keys(live).length || !Array.isArray(document.nodes)) return document
    let changed = false
    const nodes = document.nodes.map((node) => {
        const entry = live[node?.id]
        if (!entry || !node.values?.deck) return node
        if (entry.said) {
            const stored = deckHash(node.values.deck)
            if (!entry.stale) remember(entry.said, stored)
            else if (!entry.said.has(stored)) return node
        }
        changed = true
        return { ...node, values: { ...node.values, deck: entry.deck } }
    })
    return changed ? { ...document, nodes } : document
}

/**
 * { [nodeId]: { deck, at, stale, said } } for the decks this page has heard. `stale` after the hold time without a
 * word; `said` is the entry's memory (one Set per deck, shared by its entries). The listening side (a wall page).
 */
export function useDeckLive(projectId, { holdMs = DECK_LIVE_HOLD_MS } = {}) {
    const [live, setLive] = useState({})
    useEffect(() => {
        if (!projectId || typeof BroadcastChannel === 'undefined') return undefined
        const channel = new BroadcastChannel(deckLiveChannel(projectId))
        const timers = new Map()
        const memory = new Map() // nodeId -> the Set of deck hashes that deck's line has said or seen stored
        // The newest message per deck waits here; the state is set once per frame, not once per message.
        const newest = new Map()
        let frame = null
        const flush = () => {
            frame = null
            if (!newest.size) return
            const entries = [...newest]
            newest.clear()
            setLive((current) => {
                const next = { ...current }
                for (const [nodeId, entry] of entries) next[nodeId] = entry
                return next
            })
        }
        channel.onmessage = (event) => {
            const data = event?.data
            if (data?.kind === 'bye' && typeof data.nodeId === 'string') {
                clearTimeout(timers.get(data.nodeId))
                timers.delete(data.nodeId)
                newest.delete(data.nodeId)
                memory.delete(data.nodeId)
                setLive((current) => {
                    if (!(data.nodeId in current)) return current
                    const next = { ...current }
                    delete next[data.nodeId]
                    return next
                })
                return
            }
            if (data?.kind !== 'deck' || typeof data.nodeId !== 'string' || !data.deck) return
            if (!memory.has(data.nodeId)) memory.set(data.nodeId, new Set())
            const said = memory.get(data.nodeId)
            remember(said, deckHash(data.deck))
            newest.set(data.nodeId, { deck: data.deck, at: data.at, stale: false, said })
            if (typeof requestAnimationFrame === 'function') {
                if (frame === null) frame = requestAnimationFrame(flush)
            } else {
                flush()
            }
            clearTimeout(timers.get(data.nodeId))
            timers.set(data.nodeId, setTimeout(() => {
                timers.delete(data.nodeId)
                // quiet: stale, not gone (a new object, so whoever draws from it looks again)
                setLive((current) => {
                    const entry = current[data.nodeId]
                    if (!entry || entry.stale) return current
                    return { ...current, [data.nodeId]: { ...entry, stale: true } }
                })
            }, holdMs))
        }
        return () => {
            for (const timer of timers.values()) clearTimeout(timer)
            if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
            newest.clear()
            memory.clear()
            channel.close()
            setLive({})
        }
    }, [projectId, holdMs])
    return live
}
