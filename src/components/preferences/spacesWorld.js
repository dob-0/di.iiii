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
