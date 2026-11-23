// One pure layout for the Monitor map, used by the 2D, 3D and List views.
// di.iiii sits in the centre; ring 1 holds the tiers, ring 2 the machines,
// ring 3 spaces, shows, agents and repos. Same input -> same positions, so
// nothing jumps between snapshots. 2D uses (x, y); 3D uses the same (x, y) as
// floor (x, z) and adds a height by kind, so "Top view" in 3D IS the 2D map.

export const KIND_ORDER = ['tier', 'machine', 'agent', 'space', 'person', 'show', 'repo']
export const KIND_TITLE = { repo: 'Repos', agent: 'Agents', machine: 'Machines', tier: 'Tiers', space: 'Spaces', person: 'People', show: 'Shows' }
// Height of a body above the floor, in the same units as x and y (3D only).
export const KIND_HEIGHT = { tier: 240, machine: 140, agent: 100, space: 60, person: 30, show: 60, repo: 30 }
// Card size per kind (2D), also the room each node needs on its ring.
export const KIND_SIZE = {
    tier: { w: 190, h: 60 },
    machine: { w: 170, h: 56 },
    agent: { w: 160, h: 52 },
    space: { w: 160, h: 52 },
    person: { w: 160, h: 52 },
    show: { w: 160, h: 52 },
    repo: { w: 160, h: 52 }
}
export const sizeOf = (kind) => KIND_SIZE[kind] || KIND_SIZE.space

// The map is drawn on ellipses (wider than tall) because screens are.
export const ASPECT = 1.45
const LANE_GAP = 74
const MAX_PER_LANE = 14
const TAU = Math.PI * 2

const norm = (a) => ((a % TAU) + TAU) % TAU
// a node may name its own ring (the Spaces world puts spaces on ring 1 and people on ring 3)
const ringOf = (node) => (node.ring === 1 || node.ring === 2 || node.ring === 3 ? node.ring : node.kind === 'tier' ? 1 : node.kind === 'machine' ? 2 : 3)

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
    const rings = { 1: nodes.filter((n) => ringOf(n) === 1), 2: nodes.filter((n) => ringOf(n) === 2), 3: nodes.filter((n) => ringOf(n) === 3) }

    // radii from how many nodes a ring has to carry, never smaller than a floor
    const lanes3 = Math.max(1, Math.min(3, Math.ceil(rings[3].length / MAX_PER_LANE)))
    const r1 = Math.max(rings[1].length ? Math.max(105, (190 / aspect) * 0.75) : 0, (rings[1].length * 200) / TAU)
    const r2 = Math.max(r1 + 120, (rings[2].length * 170) / TAU)
    const r3 = Math.max(r2 + 125, (rings[3].length * 160) / TAU / lanes3 + 30)
    const radius = { 1: r1, 2: r2, 3: r3 }

    const pos = new Map()
    const place = (list, ring) => {
        const n = list.length
        const lanes = ring === 3 ? lanes3 : 1
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
    for (const ring of [1, 2, 3]) {
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

    const outer = Math.max(...[1, 2, 3].filter((r) => rings[r].length).map((r) => radius[r] + (r === 3 ? (lanes3 - 1) * LANE_GAP : 0)), 130)
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
        minY = Math.min(minY, p.y - h / 2 - 60) // room for the hover tip above
        maxY = Math.max(maxY, p.y + h / 2)
    }
    const pad = 36
    const bounds = { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 }
    return {
        nodes,
        edges,
        pos,
        radii: [1, 2, 3].filter((r) => rings[r].length).map((r) => radius[r]),
        hub: { x: 0, y: 0 },
        tierIds: rings[1].map((n) => n.id),
        bounds,
        outer,
        aspect
    }
}

// ── kinds as lanes (the Monitor map) ────────────────────────────────────────
// One look per kind, shared by the 2D glyphs, the 3D bodies and the legend: a token colour and a shape.
// Lanes run outward: tiers, machines, repos, spaces, shows, agents; each lane is as many rings as it needs
// so a big kind (40 agents) never crowds a small one.
export const KIND_STYLE = {
    tier: { token: '--di-cyan', shape: 'bar', title: 'Tier' },
    machine: { token: '--di-text', shape: 'triangle', title: 'Machine' },
    repo: { token: '--di-text', shape: 'circle', title: 'Repo' },
    space: { token: '--di-cyan', shape: 'square', title: 'Space' },
    show: { token: '--di-success', shape: 'hex', title: 'Show' },
    agent: { token: '--di-warning', shape: 'diamond', title: 'Agent' },
    person: { token: '--di-warning', shape: 'diamond', title: 'Person' }
}
const LANES = ['tier', 'machine', 'repo', 'space', 'show', 'agent']
const PER_RING = 14
const GAP = 14

export const layoutMonitorMap = (map, aspect = ASPECT) => {
    const base = layoutMap(map, aspect)
    const nodes = base.nodes
    const root = Math.sqrt((aspect * aspect + 1) / 2)
    const byKind = (k) => nodes.filter((n) => n.kind === k).sort((a, b) => (a.id < b.id ? -1 : 1))
    const angleOf = new Map()
    const pos = new Map()
    const radii = []
    let inner = 60 // outer edge of the previous lane: the hub stays small
    for (const kind of LANES) {
        const list = byKind(kind)
        if (!list.length) continue
        const rings = Math.max(1, Math.ceil(list.length / PER_RING))
        const per = Math.ceil(list.length / rings)
        const { w, h } = sizeOf(kind)
        const r = Math.max(inner + h + 54, (per * (w + 18)) / (TAU * root))
        // order by where the neighbours already placed stand, so a machine's agents sit near the machine
        const near = new Map(list.map((n) => {
            const m = meanAngle(base.edges.map((e) => (e.from === n.id ? e.to : e.to === n.id ? e.from : null)).filter((id) => id && angleOf.has(id)).map((id) => angleOf.get(id)))
            return [n.id, m == null ? Infinity : m]
        }))
        list.sort((a, b) => near.get(a.id) - near.get(b.id) || (a.id < b.id ? -1 : 1))
        list.forEach((n, i) => {
            const ring = i % rings
            const slot = Math.floor(i / rings)
            const a = -Math.PI / 2 + ((slot + (ring % 2 ? 0.5 : 0)) / per) * TAU
            const rr = r + ring * (h + 30)
            angleOf.set(n.id, norm(a))
            pos.set(n.id, { x: Math.cos(a) * rr * aspect, y: Math.sin(a) * rr, h: KIND_HEIGHT[kind] ?? 60, ring: LANES.indexOf(kind) + 1, angle: norm(a) })
        })
        radii.push(r)
        inner = r + (rings - 1) * (h + 30) + h / 2
    }
    // push apart whatever still touches (cards are wide, rings narrow at the sides)
    const live = new Map(nodes.map((n) => [n.id, { ...pos.get(n.id), ...sizeOf(n.kind) }]))
    const home = new Map(nodes.map((n) => [n.id, { x: pos.get(n.id).x, y: pos.get(n.id).y }]))
    const hub = { x: 0, y: 0, w: 92, h: 40 }
    for (let it = 0; it < 120; it += 1) {
        let moved = false
        for (const n of nodes) { const q = live.get(n.id); const o = home.get(n.id); q.x += (o.x - q.x) * 0.03; q.y += (o.y - q.y) * 0.03 }
        const push = (a, b, share) => {
            const ox = (a.w + b.w) / 2 + GAP - Math.abs(a.x - b.x)
            const oy = (a.h + b.h) / 2 + GAP - Math.abs(a.y - b.y)
            if (ox <= 0 || oy <= 0) return
            moved = true
            if (oy <= ox) { const d = (a.y >= b.y ? 1 : -1) * oy * share; a.y += d; if (share < 1) b.y -= d } else { const d = (a.x >= b.x ? 1 : -1) * ox * share; a.x += d; if (share < 1) b.x -= d }
        }
        for (let i = 0; i < nodes.length; i += 1) {
            const a = live.get(nodes[i].id)
            push(a, hub, 1)
            for (let j = i + 1; j < nodes.length; j += 1) push(a, live.get(nodes[j].id), 0.5)
        }
        if (!moved && it > 10) break
    }
    let minX = -50; let maxX = 50; let minY = -24; let maxY = 24
    for (const n of nodes) {
        const q = live.get(n.id)
        const p = pos.get(n.id)
        pos.set(n.id, { ...p, x: Math.round(q.x * 100) / 100, y: Math.round(q.y * 100) / 100 })
        const { w, h } = sizeOf(n.kind)
        minX = Math.min(minX, q.x - w / 2); maxX = Math.max(maxX, q.x + w / 2)
        minY = Math.min(minY, q.y - h / 2 - 60); maxY = Math.max(maxY, q.y + h / 2)
    }
    const pad = 36
    return { ...base, pos, radii, tierIds: byKind('tier').map((n) => n.id), bounds: { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 }, outer: Math.max(...radii, 130), aspect }
}
