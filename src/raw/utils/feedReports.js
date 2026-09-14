import { useEffect, useState } from 'react'

// What a live feed says about itself, for the window that shows it.
//
// A device node (Webcam, Mic, MIDI In, DMX Out, Keeper) is two things: a feed
// that holds the device and publishes into the graph, mounted for as long as
// the node exists; and a window that only LOOKS at it. The window can close,
// go fullscreen or be in another scope and the camera keeps feeding the Plane.
// What the window needs beyond the graph's own values — a status line, the
// device list, the last message, an ask() — travels here, per node.
//
// Module-level like topReports: the feeds live in the editor's feed layer and
// the windows are drawn by renderPanelContent, which is not a component and
// cannot thread props from one to the other.

const reports = new Map()
const listeners = new Map()

const sameReport = (a, b) => {
    if (a === b) return true
    const keys = Object.keys(a)
    if (keys.length !== Object.keys(b).length) return false
    return keys.every((key) => Object.is(a[key], b[key]))
}

/** Merge `patch` into a node's report and tell its windows. */
export const reportFeed = (nodeId, patch) => {
    if (!nodeId || !patch) return
    const before = reports.get(nodeId) || {}
    const next = { ...before, ...patch }
    if (sameReport(before, next)) return
    reports.set(nodeId, next)
    for (const listener of listeners.get(nodeId) || []) listener(next)
}

/** The feed went away (node deleted): its windows show nothing live. */
export const clearFeedReport = (nodeId) => {
    if (!reports.has(nodeId)) return
    reports.delete(nodeId)
    for (const listener of listeners.get(nodeId) || []) listener({})
}

export const readFeedReport = (nodeId) => reports.get(nodeId) || {}

/** A window's view of its feed. `nodeId` null subscribes to nothing. */
export function useFeedReport(nodeId) {
    const [report, setReport] = useState(() => (nodeId ? readFeedReport(nodeId) : {}))
    useEffect(() => {
        if (!nodeId) return undefined
        setReport(readFeedReport(nodeId))
        const set = listeners.get(nodeId) || new Set()
        set.add(setReport)
        listeners.set(nodeId, set)
        return () => {
            set.delete(setReport)
            if (!set.size) listeners.delete(nodeId)
        }
    }, [nodeId])
    return report
}
