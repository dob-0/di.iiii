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
// `bounds` ({ width, height } of the stage, px) keeps every moved name whole on the stage.
export const nudgeLabels = (items, { gap = 4, passes = 40, limit = 160, bounds = null } = {}) => {
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
        if (bounds) {
            for (const it of list) {
                if (it.fixed) continue
                // whole on the stage: centre between half a card from each edge (a card wider than the stage sits at the left)
                const keep = (off, at, size, room) => { const lo = size / 2 - at; return Math.min(Math.max(off, lo), Math.max(lo, room - size / 2 - at)) }
                it.ox = keep(it.ox, it.x, it.w, bounds.width)
                it.oy = keep(it.oy, it.y, it.h, bounds.height)
            }
        }
        if (!moved) break
    }
    const out = {}
    for (const it of list) if (Math.round(it.ox) || Math.round(it.oy)) out[it.id] = { dx: Math.round(it.ox), dy: Math.round(it.oy) }
    return out
}

// Cards that never sit on each other, found by search instead of by pushing: items go in a fixed order (biggest first, then id);
// an item whose own place is free stays; otherwise it takes the nearest free place on a `step` px grid round it, kept whole inside
// `bounds` ({ width, height } px) when given. Returns { ok, offsets: { id: { dx, dy } } }; ok is false when some item found no place
// (the stage is too full), and that item stays where it was. Same input, same answer.
export const packLabels = (items, { gap = 4, step = 6, bounds = null, reach = 600 } = {}) => {
    const order = [...(items || [])].sort((a, b) => (b.w * b.h) - (a.w * a.h) || String(a.id).localeCompare(String(b.id)))
    const placed = []
    const offsets = {}
    let ok = true
    const free = (x, y, it) => {
        if (bounds && (x - it.w / 2 < 0 || x + it.w / 2 > bounds.width || y - it.h / 2 < 0 || y + it.h / 2 > bounds.height)) return false
        for (const p of placed) if (Math.abs(x - p.x) < (it.w + p.w) / 2 + gap && Math.abs(y - p.y) < (it.h + p.h) / 2 + gap) return false
        return true
    }
    for (const it of order) {
        let spot = free(it.x, it.y, it) ? { x: it.x, y: it.y } : null
        for (let r = step; !spot && r <= reach; r += step) {
            let best = null
            let bestD = Infinity
            const n = Math.max(8, Math.round((2 * Math.PI * r) / step))
            for (let i = 0; i < n; i += 1) {
                const a = (i / n) * 2 * Math.PI
                const x = it.x + Math.cos(a) * r
                const y = it.y + Math.sin(a) * r
                if (!free(x, y, it)) continue
                const d = Math.abs(x - it.x) + Math.abs(y - it.y)
                if (d < bestD) { best = { x, y }; bestD = d }
            }
            spot = best
        }
        if (!spot) { ok = false; spot = { x: it.x, y: it.y } }
        placed.push({ ...it, x: spot.x, y: spot.y })
        const dx = Math.round(spot.x - it.x)
        const dy = Math.round(spot.y - it.y)
        if (dx || dy) offsets[it.id] = { dx, dy }
    }
    return { ok, offsets }
}
