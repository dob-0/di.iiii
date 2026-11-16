// The Monitor map, grouped: one pure function from the server's map to the map he reads.
//   - one node per space NAME (a tier's copy of a space is a small badge, not its own card)
//   - more than FOLD_OVER spaces under one parent fold into ONE group node "15 spaces"
//     that opens on click (`expanded` holds the group ids that are open)
//   - 'holds' lines are drawn only when one of their ends is hovered or selected (visibleEdges)
// Same input, same output: nodes and edges are sorted by id, so nothing jumps between snapshots.

export const FOLD_OVER = 8
const SPACE_ID = /^space:(.+):([^:]+)$/
const HOLDS = 'holds'

export const tierBadge = (tierId) => (String(tierId).startsWith('local') ? 'local' : String(tierId))
const BADGE_ORDER = ['dev', 'prod', 'local']
const worst = (states) => (states.includes('warn') ? 'warn' : states.includes('ok') ? 'ok' : states[0] || 'off')
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
const tierNodeLabel = (label) => (String(label).startsWith('local:') ? `local · ${String(label).slice(6)}` : label)

export const groupMap = (map, { expanded = [], open = false } = {}) => {
    const openIds = new Set(expanded)
    const seen = new Set()
    const raw = []
    for (const n of map?.nodes || []) {
        if (!n || n.id == null || seen.has(n.id)) continue
        seen.add(n.id)
        raw.push(n)
    }
    const rawEdges = (map?.edges || []).filter((e) => e && seen.has(e.from) && seen.has(e.to) && e.from !== e.to)

    // 1. one node per space name
    const spaceName = new Map() // raw id -> name
    const spaces = new Map() // name -> { rawIds, tiers, states }
    for (const n of raw) {
        if (n.kind !== 'space') continue
        const m = SPACE_ID.exec(n.id)
        const name = n.label
        spaceName.set(n.id, name)
        if (!spaces.has(name)) spaces.set(name, { rawIds: [], tiers: new Set(), states: [] })
        const s = spaces.get(name)
        s.rawIds.push(n.id)
        s.states.push(n.state)
        if (m) s.tiers.add(tierBadge(m[1]))
    }
    const mergedId = (name) => `space:${name}`
    const rep = (id) => (spaceName.has(id) ? mergedId(spaceName.get(id)) : id)

    // 2. the parent of each space: the dev tier when it holds it, else the first tier by id
    const parents = new Map() // name -> tier node id
    for (const e of rawEdges) {
        if (e.kind !== HOLDS || !spaceName.has(e.to)) continue
        const name = spaceName.get(e.to)
        const cur = parents.get(name)
        if (!cur || e.from === 'tier:dev' || (cur !== 'tier:dev' && e.from < cur)) parents.set(name, e.from)
    }
    const children = new Map() // parent id -> [names]
    for (const [name, parent] of parents) {
        if (!children.has(parent)) children.set(parent, [])
        children.get(parent).push(name)
    }

    // 3. fold the big families
    const folded = new Map() // name -> group id
    const groups = []
    for (const [parent, names] of children) {
        const gid = `group:${parent}`
        if (names.length <= FOLD_OVER || open || openIds.has(gid)) continue
        names.sort()
        for (const name of names) folded.set(name, gid)
        const states = names.map((name) => worst(spaces.get(name).states))
        groups.push({ id: gid, kind: 'group', label: `${names.length} spaces`, state: worst(states), members: names, tiers: [tierBadge(parent.replace(/^tier:/, ''))], rawIds: names.flatMap((name) => spaces.get(name).rawIds), parent })
    }
    const finalId = (id) => {
        const r = rep(id)
        const name = spaceName.get(id)
        return name != null && folded.has(name) ? folded.get(name) : r
    }

    // 4. nodes
    const nodes = []
    for (const n of raw) {
        if (n.kind === 'space') continue
        nodes.push({ ...n, label: n.kind === 'tier' ? tierNodeLabel(n.label) : n.label, rawIds: [n.id] })
    }
    for (const [name, s] of spaces) {
        if (folded.has(name)) continue
        nodes.push({ id: mergedId(name), kind: 'space', label: name, state: worst(s.states), tiers: [...s.tiers].sort((a, b) => BADGE_ORDER.indexOf(a) - BADGE_ORDER.indexOf(b)), rawIds: s.rawIds })
    }
    nodes.push(...groups)
    nodes.sort(byId)

    // 5. edges: remapped, deduped, sorted
    const edgeSeen = new Set()
    const edges = []
    for (const e of rawEdges) {
        const from = finalId(e.from)
        const to = finalId(e.to)
        if (from === to) continue
        const key = `${from}>${to}>${e.kind}`
        if (edgeSeen.has(key)) continue
        edgeSeen.add(key)
        edges.push({ from, to, kind: e.kind })
    }
    edges.sort((a, b) => (`${a.from}>${a.to}>${a.kind}` < `${b.from}>${b.to}>${b.kind}` ? -1 : 1))
    return { nodes, edges }
}

// the lines drawn now: every default edge, and a 'holds' line only next to the node in focus
// `holdsMax`: when the whole map has at most that many 'holds' lines they are all drawn, so every node shows the
// link to its parent tier; a bigger map (groups opened) keeps them to the node in focus. Default 0 = focus only.
export const visibleEdges = (edges, focusId, holdsMax = 0) => {
    const all = edges || []
    const showHolds = all.filter((e) => e.kind === HOLDS).length <= holdsMax
    return all.filter((e) => e.kind !== HOLDS || showHolds || (!!focusId && (e.from === focusId || e.to === focusId)))
}
