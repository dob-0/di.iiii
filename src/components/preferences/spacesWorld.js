import { ASPECT, KIND_HEIGHT, layoutMap, sizeOf } from './monitorMapLayout.js'

// The Spaces world: spaces as nodes, the people who can open each one around
// them, drawn by the Monitor map engine. Pure: the same lists give the same map.
// Spaces sit on ring 1 (di.iiii in the middle), people on ring 3; a line joins a
// person to every space they were granted. Unrestricted accounts reach every
// space, so they get no per-space lines (that would be a line to everything).

export const spaceNodeId = (id) => `space:${id}`
export const personNodeId = (id) => `person:${id}`
export const NAME_ALL_UNDER = 36 // up to this many nodes every card carries its name in 3D

export const buildSpacesWorld = (spaces = [], users = [], { globalSpaceId = null } = {}) => {
    const spaceList = Array.isArray(spaces) ? spaces : []
    const userList = Array.isArray(users) ? users : []
    const known = new Set(spaceList.map((s) => s.id))
    const total = spaceList.length + userList.length
    const named = total <= NAME_ALL_UNDER
    const nodes = []
    const edges = []
    for (const s of spaceList) {
        const state = s.isPublic ? 'ok' : 'off'
        const flags = [s.isPublic ? 'live' : 'private', globalSpaceId === s.id ? 'guest' : null].filter(Boolean)
        nodes.push({ id: spaceNodeId(s.id), kind: 'space', ring: 1, label: s.label || s.id, state, stateLabel: flags.join(' · '), named: true })
    }
    for (const u of userList) {
        const role = u.role || 'viewer'
        nodes.push({
            id: personNodeId(u.id), kind: 'person', ring: 3, label: u.displayName || u.email || u.id,
            state: u.isUnrestricted ? 'warn' : role === 'admin' ? 'ok' : 'off',
            stateLabel: u.isUnrestricted ? `${role} · all spaces` : role, named
        })
        if (u.isUnrestricted) continue
        for (const sid of u.spaces || []) {
            if (known.has(sid)) edges.push({ from: personNodeId(u.id), to: spaceNodeId(sid), kind: 'member' })
        }
    }
    return { nodes, edges }
}

/** People who can open a space: granted ones plus unrestricted ones. */
export const peopleInSpace = (users = [], spaceId) => (Array.isArray(users) ? users : [])
    .filter((u) => u.isUnrestricted || (u.spaces || []).includes(spaceId))

// ── the clustered layout ────────────────────────────────────────────────────
// Spaces stay on their ring; each person is placed just outside the space they
// belong to (several spaces: between them), then cards that would overlap are
// pushed apart, so no two names collide. People with no per-space line
// (unrestricted accounts) fan out on the outer edge. Pure and deterministic.
const TAU = Math.PI * 2
const GAP = 12
const meanAngle = (angles) => {
    let s = 0
    let c = 0
    for (const a of angles) { s += Math.sin(a); c += Math.cos(a) }
    return Math.atan2(s, c)
}

export const layoutSpacesWorld = (map, aspect = ASPECT) => {
    const base = layoutMap(map, aspect)
    const people = base.nodes.filter((n) => n.kind === 'person')
    if (!people.length) return base
    const spaceNodes = base.nodes.filter((n) => n.kind === 'space')
    // compact ring: the whole world has to read inside a small pane
    const r1 = spaceNodes.length ? Math.max(92, (spaceNodes.length * 150) / (TAU * Math.sqrt((aspect * aspect + 1) / 2))) : 0
    const hasSpaces = spaceNodes.length > 0
    const linked = new Map(people.map((p) => [p.id, []]))
    for (const e of base.edges) {
        if (linked.has(e.from) && base.pos.has(e.to) && e.to.startsWith('space:')) linked.get(e.from).push(base.pos.get(e.to).angle)
    }
    const ordered = [...people].sort((a, b) => (a.id < b.id ? -1 : 1))
    const loose = ordered.filter((p) => !linked.get(p.id).length)
    const init = new Map()
    const taken = new Map() // anchor angle (rounded) -> how many already stand there
    for (const p of ordered) {
        const angles = linked.get(p.id)
        if (!angles.length) continue
        const a = meanAngle(angles)
        const key = Math.round(a * 100)
        const k = taken.get(key) || 0
        taken.set(key, k + 1)
        const r = (hasSpaces ? r1 : 0) + 124 + (k % 2) * 60 + Math.floor(k / 2) * 120
        const aa = a + (k % 2 ? 0.1 : -0.1) * Math.ceil(k / 2)
        init.set(p.id, { x: Math.cos(aa) * r * aspect, y: Math.sin(aa) * r })
    }
    loose.forEach((p, i) => {
        const a = -Math.PI / 2 + ((i + 0.5) / loose.length) * TAU
        const r = (hasSpaces ? r1 : 0) + 170
        init.set(p.id, { x: Math.cos(a) * r * aspect, y: Math.sin(a) * r })
    })
    const pos = new Map(base.pos)
    spaceNodes.forEach((n) => {
        const a = base.pos.get(n.id).angle
        pos.set(n.id, { ...base.pos.get(n.id), x: Math.round(Math.cos(a) * r1 * aspect * 100) / 100, y: Math.round(Math.sin(a) * r1 * 100) / 100 })
    })
    // spaces and people all move a little so no two cards overlap; the hub stays
    spaceNodes.forEach((n) => init.set(n.id, { x: pos.get(n.id).x, y: pos.get(n.id).y }))
    const movers = [...spaceNodes, ...ordered]
    const live = new Map(movers.map((p) => [p.id, { ...init.get(p.id) }]))
    const fixed = [{ x: 0, y: 0, w: 92, h: 40 }]
    const sz = new Map(movers.map((n) => [n.id, sizeOf(n.kind)]))
    for (let it = 0; it < 160; it += 1) {
        for (const p of movers) {
            const q = live.get(p.id)
            const home = init.get(p.id)
            const k = p.kind === 'space' ? 0.04 : 0.02
            q.x += (home.x - q.x) * k
            q.y += (home.y - q.y) * k
        }
        let moved = false
        const push = (a, b, share) => {
            const ox = (a.w + b.w) / 2 + GAP - Math.abs(a.x - b.x)
            const oy = (a.h + b.h) / 2 + GAP - Math.abs(a.y - b.y)
            if (ox <= 0 || oy <= 0) return
            moved = true
            if (oy <= ox) { const d = (a.y >= b.y ? 1 : -1) * oy * share; a.y += d; if (share < 1) b.y -= d } else { const d = (a.x >= b.x ? 1 : -1) * ox * share; a.x += d; if (share < 1) b.x -= d }
        }
        for (let i = 0; i < movers.length; i += 1) {
            const a = live.get(movers[i].id)
            a.w = sz.get(movers[i].id).w; a.h = sz.get(movers[i].id).h
            for (const f of fixed) push(a, f, 1)
            for (let j = i + 1; j < movers.length; j += 1) {
                const b = live.get(movers[j].id)
                b.w = sz.get(movers[j].id).w; b.h = sz.get(movers[j].id).h
                push(a, b, 0.5)
            }
        }
        if (!moved && it > 20) break
    }
    for (const p of movers) {
        const q = live.get(p.id)
        const x = Math.round(q.x * 100) / 100
        const y = Math.round(q.y * 100) / 100
        pos.set(p.id, { x, y, h: KIND_HEIGHT[p.kind] ?? 60, ring: p.kind === 'space' ? 1 : 3, angle: ((Math.atan2(y, x / aspect) % TAU) + TAU) % TAU })
    }
    let minX = -50; let maxX = 50; let minY = -24; let maxY = 24
    for (const n of base.nodes) {
        const q = pos.get(n.id)
        const { w, h } = sizeOf(n.kind)
        minX = Math.min(minX, q.x - w / 2); maxX = Math.max(maxX, q.x + w / 2)
        minY = Math.min(minY, q.y - h / 2 - 60); maxY = Math.max(maxY, q.y + h / 2)
    }
    const pad = 36
    return { ...base, pos, radii: hasSpaces ? [r1] : [], bounds: { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 } }
}

// kind colours, token names only (the 2D CSS and the 3D scene both read these)
export const WORLD_KIND_TOKEN = { space: '--di-cyan', person: '--di-warning' }
