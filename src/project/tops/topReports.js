import { useEffect, useState } from 'react'

// What an operator's machine says about it, for whoever looks inside:
//
//   camera   { label, capabilities, settings }   the real device, as its machine sees it
//   shader   the compiler's message, or null
//   script   the script's error, or null; `scriptsAllowed` whether its machine runs scripts
//
// The operator may run on another machine; its reports then arrive over the
// picture link (picturePeers 'report'). Either way they land here, per node.

const reports = new Map()
const listeners = new Map()

export const reportTop = (nodeId, patch) => {
    if (!nodeId || !patch) return
    const before = reports.get(nodeId) || {}
    const next = { ...before, ...patch }
    if (JSON.stringify(before) === JSON.stringify(next)) return
    reports.set(nodeId, next)
    for (const listener of listeners.get(nodeId) || []) listener(next)
}

export const readTopReport = (nodeId) => reports.get(nodeId) || {}

export function useTopReport(nodeId) {
    const [report, setReport] = useState(() => readTopReport(nodeId))
    useEffect(() => {
        if (!nodeId) return undefined
        setReport(readTopReport(nodeId))
        const set = listeners.get(nodeId) || new Set()
        set.add(setReport)
        listeners.set(nodeId, set)
        return () => set.delete(setReport)
    }, [nodeId])
    return report
}

// The operator someone is looking inside. Its picture is worth full video, not
// a thumbnail, when it runs on another machine.
let inspected = null
const inspectedListeners = new Set()
export const setInspectedTop = (nodeId) => {
    if (inspected === nodeId) return
    inspected = nodeId
    for (const listener of inspectedListeners) listener(nodeId)
}
export function useInspectedTop() {
    const [value, setValue] = useState(inspected)
    useEffect(() => {
        inspectedListeners.add(setValue)
        return () => inspectedListeners.delete(setValue)
    }, [])
    return value
}
