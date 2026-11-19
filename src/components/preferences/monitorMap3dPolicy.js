// Pure decisions for the 3D Monitor map, kept out of the canvas so they can be tested without WebGL.
// Rule: a still map draws zero frames. A frame is drawn for a reason: a change, a gesture, a pulse.

export const PULSE_MS = 3000
export const LIVE_EDGE_KINDS = new Set(['runs', 'serves'])

// the camera re-fits only when the SET of nodes changes (a new snapshot object with the same ids is not a reason)
export const fitKey = (layout) => (layout?.nodes || []).map((n) => n.id).join('|')
export const shouldRefit = (prevKey, nextKey) => prevKey !== nextKey

// what a person can see of the layout: a new snapshot with the same signature draws nothing
const r = (v) => Math.round((Number(v) || 0) * 10) / 10
export const layoutSignature = (layout) => {
    const nodes = (layout?.nodes || []).map((n) => {
        const p = layout.pos?.get(n.id) || {}
        return `${n.id}:${n.kind}:${n.state}:${n.stateLabel || ''}:${n.label}:${r(p.x)},${r(p.y)},${r(p.h)}`
    }).join('|')
    const edges = (layout?.edges || []).map((e) => `${e.from}>${e.to}>${e.kind}`).join('|')
    return `${nodes}#${edges}`
}

export const hasLiveEdge = (edges) => (edges || []).some((e) => LIVE_EDGE_KINDS.has(e.kind))

// the edges that carry a travelling light right now, by index into `edges`
// pulsing: inside the ~3 s window after a snapshot that changed something; hovered: that node's own edges
export const pulseEdgeIndexes = ({ edges, pulsing, hoverId }) => {
    const out = []
    ;(edges || []).forEach((e, i) => {
        if (!LIVE_EDGE_KINDS.has(e.kind)) return
        if (pulsing || (hoverId && (e.from === hoverId || e.to === hoverId))) out.push(i)
    })
    return out
}

// the timer that asks for frames runs only when something travels, the tab is visible and motion is allowed
export const shouldAnimate = ({ edges, pulsing, hoverId, visible = true, reduced = false }) => {
    if (reduced || !visible) return false
    return pulseEdgeIndexes({ edges, pulsing, hoverId }).length > 0
}
