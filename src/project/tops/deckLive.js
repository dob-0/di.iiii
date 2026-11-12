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
// back. When the deck goes quiet for HOLD_MS the wall draws from its document again, which by then has caught up.
// Nothing is stored and nothing is written: a wall that never hears the line is late, not wrong.
export const DECK_LIVE_HOLD_MS = 3000
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

/** The document with each live deck in place of the stored one; the same object when nothing is live. */
export const overlayDeckLive = (document, live) => {
    if (!document || !live || !Object.keys(live).length || !Array.isArray(document.nodes)) return document
    let changed = false
    const nodes = document.nodes.map((node) => {
        const entry = live[node?.id]
        if (!entry || !node.values?.deck) return node
        changed = true
        return { ...node, values: { ...node.values, deck: entry.deck } }
    })
    return changed ? { ...document, nodes } : document
}

/** { [nodeId]: { deck, at } } for the decks heard within the hold time. The listening side (a wall page). */
export function useDeckLive(projectId, { holdMs = DECK_LIVE_HOLD_MS } = {}) {
    const [live, setLive] = useState({})
    useEffect(() => {
        if (!projectId || typeof BroadcastChannel === 'undefined') return undefined
        const channel = new BroadcastChannel(deckLiveChannel(projectId))
        const timers = new Map()
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
            if (data?.kind !== 'deck' || typeof data.nodeId !== 'string' || !data.deck) return
            newest.set(data.nodeId, { deck: data.deck, at: data.at })
            if (typeof requestAnimationFrame === 'function') {
                if (frame === null) frame = requestAnimationFrame(flush)
            } else {
                flush()
            }
            clearTimeout(timers.get(data.nodeId))
            timers.set(data.nodeId, setTimeout(() => {
                timers.delete(data.nodeId)
                setLive((current) => {
                    if (!(data.nodeId in current)) return current
                    const next = { ...current }
                    delete next[data.nodeId]
                    return next
                })
            }, holdMs))
        }
        return () => {
            for (const timer of timers.values()) clearTimeout(timer)
            if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
            newest.clear()
            channel.close()
            setLive({})
        }
    }, [projectId, holdMs])
    return live
}
