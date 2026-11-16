// One pure layout for the Monitor map, used by the 2D, 3D and List views.
// di.iiii sits in the centre; ring 1 holds the tiers, ring 2 the machines,
// ring 3 spaces, shows, agents and repos. Same input -> same positions, so
// nothing jumps between snapshots. 2D uses (x, y); 3D uses the same (x, y) as
// floor (x, z) and adds a height by kind, so "Top view" in 3D IS the 2D map.

export const KIND_ORDER = ['tier', 'machine', 'agent', 'space', 'group', 'show', 'repo', 'knowledge', 'helper']
export const KIND_TITLE = { repo: 'Repos', agent: 'Agents', machine: 'Machines', tier: 'Tiers', space: 'Spaces', group: 'Spaces', show: 'Shows', knowledge: 'To do, rules, skills, hooks', helper: 'Helpers' }
// Height of a body above the floor, in the same units as x and y (3D only).
export const KIND_HEIGHT = { tier: 240, machine: 140, agent: 100, space: 60, group: 60, show: 60, repo: 30, knowledge: 20, helper: 10 }
// Card size per kind (2D), also the room each node needs on its ring.
export const KIND_SIZE = {
    tier: { w: 190, h: 60 },
    machine: { w: 170, h: 56 },
    agent: { w: 160, h: 52 },
    space: { w: 160, h: 52 },
    group: { w: 160, h: 52 },
    show: { w: 160, h: 52 },
    repo: { w: 160, h: 52 },
    knowledge: { w: 160, h: 52 },
    helper: { w: 150, h: 46 }
}
export const sizeOf = (kind) => KIND_SIZE[kind] || KIND_SIZE.space

// The map is drawn on ellipses (wider than tall) because screens are.
export const ASPECT = 1.8
const LANE_GAP = 74
// ring spacing: a card is 52 high, so rings 95 apart never touch even with a few nodes per ring
const RING_GAP = 95
const MAX_PER_LANE = 14
const TAU = Math.PI * 2

const norm = (a) => ((a % TAU) + TAU) % TAU
// knowledge and helpers have their own outer band (ring 4), so they never crowd the spaces
const ringOf = (kind) => (kind === 'tier' ? 1 : kind === 'machine' ? 2 : kind === 'knowledge' || kind === 'helper' ? 4 : 3)

// Mean direction of angles (circular mean), or null when there are none.
const meanAngle = (angles) => {
    if (!angles.length) return null
    let s = 0
    let c = 0
    for (const a of angles) { s += Math.sin(a); c += Math.cos(a) }
    return norm(Math.atan2(s, c))
}

// `aspect` is the ellipse width / height: wide on a desk, round on a phone.
export const layoutMap = (map, aspect = ASPECT) => {
    const seen = new Set()
    const nodes = []
    for (const n of map?.nodes || []) {
        if (!n || n.id == null || seen.has(n.id)) continue
        seen.add(n.id)
        nodes.push(n)
    }
    const edges = (map?.edges || []).filter((e) => e && seen.has(e.from) && seen.has(e.to) && e.from !== e.to)
    const angleOf = new Map()
    const neighbours = (id) => edges.map((e) => (e.from === id ? e.to : e.to === id ? e.from : null)).filter(Boolean)
    const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    const rings = { 1: nodes.filter((n) => ringOf(n.kind) === 1), 2: nodes.filter((n) => ringOf(n.kind) === 2), 3: nodes.filter((n) => ringOf(n.kind) === 3), 4: nodes.filter((n) => ringOf(n.kind) === 4) }

    // radii from how many nodes a ring has to carry, never smaller than a floor
    const lanes3 = Math.max(1, Math.min(3, Math.ceil(rings[3].length / MAX_PER_LANE)))
    const r1 = Math.max(rings[1].length ? Math.max(95, (190 / aspect) * 0.75) : 0, (rings[1].length * 200) / TAU)
    const r2 = Math.max(r1 + RING_GAP, (rings[2].length * 170) / TAU)
    const r3 = Math.max(r2 + RING_GAP, (rings[3].length * 160) / TAU / lanes3 + 30)
    const r3out = r3 + (lanes3 - 1) * LANE_GAP
    const lanes4 = Math.max(1, Math.min(3, Math.ceil(rings[4].length / MAX_PER_LANE)))
    // a round (phone) map has cards side by side on the flanks, where only a card's width keeps two rings apart
    const r4 = Math.max((rings[3].length ? r3out : r2) + (aspect < 1.4 ? 175 : RING_GAP), (rings[4].length * 160) / TAU / lanes4 + 30)
    const radius = { 1: r1, 2: r2, 3: r3, 4: r4 }

    const pos = new Map()
    const place = (list, ring) => {
        const n = list.length
        const lanes = ring === 3 ? lanes3 : ring === 4 ? lanes4 : 1
        const start = -Math.PI / 2 + (ring - 1) * 0.22
        list.forEach((node, i) => {
            const a = start + (i / n) * TAU
            angleOf.set(node.id, norm(a))
            const r = radius[ring] + (i % lanes) * LANE_GAP
            pos.set(node.id, {
                x: Math.round(Math.cos(a) * r * aspect * 100) / 100,
                y: Math.round(Math.sin(a) * r * 100) / 100,
                h: KIND_HEIGHT[node.kind] ?? 60,
                ring,
                angle: norm(a)
            })
        })
    }
    for (const ring of [1, 2, 3, 4]) {
        const list = rings[ring]
        if (!list.length) continue
        const key = new Map(list.map((node) => {
            const near = meanAngle(neighbours(node.id).map((id) => angleOf.get(id)).filter((a) => a != null))
            return [node.id, near == null ? Infinity : near]
        }))
        list.sort((a, b) => {
            if (ring === 1) return byId(a, b)
            return key.get(a.id) - key.get(b.id) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || byId(a, b)
        })
        place(list, ring)
    }

    const outer = Math.max(...[1, 2, 3, 4].filter((r) => rings[r].length).map((r) => radius[r] + (r === 3 ? (lanes3 - 1) * LANE_GAP : r === 4 ? (lanes4 - 1) * LANE_GAP : 0)), 130)
    // the box that holds every card (and the hub), so Fit fills the stage with the nodes, not with empty ring
    let minX = -50
    let maxX = 50
    let minY = -24
    let maxY = 24
    for (const n of nodes) {
        const p = pos.get(n.id)
        const { w, h } = sizeOf(n.kind)
        minX = Math.min(minX, p.x - w / 2)
        maxX = Math.max(maxX, p.x + w / 2)
        minY = Math.min(minY, p.y - h / 2)
        maxY = Math.max(maxY, p.y + h / 2)
    }
    const pad = 36
    const bounds = { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 }
    return {
        nodes,
        edges,
        pos,
        radii: [1, 2, 3, 4].filter((r) => rings[r].length).map((r) => radius[r]),
        hub: { x: 0, y: 0 },
        tierIds: rings[1].map((n) => n.id),
        bounds,
        outer,
        aspect
    }
}
