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
        return `${n.id}:${n.kind}:${n.state}:${n.label}:${r(p.x)},${r(p.y)},${r(p.h)}`
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

// Names that never sit on each other: the labels are screen boxes (centre x, y, width w, height h in px).
// Two that overlap are pushed apart along the axis where they overlap least, half each; a `fixed` one
// (the hub) does not move. Same input, same answer. Returns { id: { dx, dy } } for those that moved.
export const nudgeLabels = (items, { gap = 4, passes = 40, limit = 160 } = {}) => {
    const list = (items || []).map((it) => ({ ...it, ox: 0, oy: 0 }))
    for (let pass = 0; pass < passes; pass += 1) {
        let moved = false
        for (let i = 0; i < list.length; i += 1) {
            for (let j = i + 1; j < list.length; j += 1) {
                const a = list[i]
                const b = list[j]
                const dx = b.x + b.ox - (a.x + a.ox)
                const dy = b.y + b.oy - (a.y + a.oy)
                const needX = (a.w + b.w) / 2 + gap - Math.abs(dx)
                const needY = (a.h + b.h) / 2 + gap - Math.abs(dy)
                if (needX <= 0 || needY <= 0) continue
                moved = true
                const alongY = needY <= needX
                const dir = (alongY ? dy : dx) >= 0 ? 1 : -1
                const push = (alongY ? needY : needX) / (a.fixed || b.fixed ? 1 : 2)
                const share = (it, sign) => {
                    if (it.fixed) return
                    if (alongY) it.oy = Math.max(-limit, Math.min(limit, it.oy + sign * push))
                    else it.ox = Math.max(-limit, Math.min(limit, it.ox + sign * push))
                }
                share(a, -dir)
                share(b, dir)
            }
        }
        if (!moved) break
    }
    const out = {}
    for (const it of list) if (Math.round(it.ox) || Math.round(it.oy)) out[it.id] = { dx: Math.round(it.ox), dy: Math.round(it.oy) }
    return out
}
