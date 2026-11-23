// Edges of the 3D Monitor map as lane bundles instead of a hairball of straight lines.
// Every edge belongs to a lane pair (kind of one end > kind of the other). One faint thick curve per lane pair
// runs between the middles of its ends, bowed up and toward the hub like the rings are; the lines of one node
// (picked or hovered) are drawn one by one, also as arcs. Pure: layout in, points out.
import { S } from './monitorMapCamera.js'

const at = (p) => [p.x * S, p.h * S, p.y * S]
const HUB = [0, 0.1, 0]

/** Lane pair of an edge, ordered by ring so a>b and b>a are one lane. */
const RING = { tier: 1, machine: 2 }
export const laneKey = (fromKind, toKind) => {
    const a = RING[fromKind] || 3
    const b = RING[toKind] || 3
    return a < b || (a === b && fromKind <= toKind) ? `${fromKind}>${toKind}` : `${toKind}>${fromKind}`
}

/** Points of a curved line from a to b: a quadratic arc lifted up and pulled toward the hub. */
export const arc = (a, b, { lift = 0.22, pull = 0.3, steps = 18 } = {}) => {
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    const c = [mid[0] + (HUB[0] - mid[0]) * pull, mid[1] + len * lift + (HUB[1] - mid[1]) * pull, mid[2] + (HUB[2] - mid[2]) * pull]
    const out = []
    for (let i = 0; i <= steps; i += 1) {
        const t = i / steps
        const u = 1 - t
        out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1], u * u * a[2] + 2 * u * t * c[2] + t * t * b[2]])
    }
    return out
}

/** { bundles: one per lane pair, edges: every edge as an arc }. Edge `i` is the index in layout.edges. */
export const buildEdgeLayers = (layout) => {
    const kindOf = new Map(layout.nodes.map((n) => [n.id, n.kind]))
    const lanes = new Map()
    const edges = layout.edges.map((e, i) => {
        const a = at(layout.pos.get(e.from))
        const b = at(layout.pos.get(e.to))
        const key = laneKey(kindOf.get(e.from), kindOf.get(e.to))
        const lane = lanes.get(key) || { key, count: 0, a: [0, 0, 0], b: [0, 0, 0], live: 0 }
        // keep both ends of a lane on the same side: the end whose kind comes first in the key is "a"
        const flip = `${kindOf.get(e.from)}>${kindOf.get(e.to)}` !== key
        const [pa, pb] = flip ? [b, a] : [a, b]
        for (let k = 0; k < 3; k += 1) { lane.a[k] += pa[k]; lane.b[k] += pb[k] }
        lane.count += 1
        if (e.kind === 'runs' || e.kind === 'serves') lane.live += 1
        lanes.set(key, lane)
        return { i, e, a, b, key, pts: arc(a, b) }
    })
    const bundles = [...lanes.values()].map((l) => {
        const a = l.a.map((v) => v / l.count)
        const b = l.b.map((v) => v / l.count)
        return { key: l.key, count: l.count, live: l.live > 0, pts: arc(a, b, { lift: 0.3, pull: 0.45, steps: 24 }) }
    }).sort((x, y) => (x.key < y.key ? -1 : 1))
    return { bundles, edges }
}

/** Width of a bundle's thick line, in px: wider with more edges, never a wall. */
export const bundleWidth = (count) => Math.min(9, 3 + Math.log2(1 + count) * 1.2)
