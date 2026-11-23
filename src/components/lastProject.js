// The last project the person stood in. Two memories, for two questions:
//  - the tab's last project (sessionStorage): where Tools and Wiki go, as before;
//  - each space's last project on this device (localStorage, `dii.lastProjectBySpace`):
//    what "Nodes" on the bar opens at space level, so a new tab on the same
//    laptop opens it too (batch 2 of the reach work, N3851.19). Ids only, no
//    titles and nothing private; at most KEEP spaces, the oldest dropped.
// Tools and Wiki are not inside a project, so their bar used to send Studio and
// Nodes to the global hubs and the project was lost on the way (route audit,
// 2026-11-10). Every bar that has a project remembers it; those two pages read it.
const KEY = 'dii.lastProject'
const BY_SPACE_KEY = 'dii.lastProjectBySpace'
const KEEP = 50

export const rememberProject = (space, project) => {
    if (!space || !project) return
    try {
        window.sessionStorage.setItem(KEY, JSON.stringify({ space, project }))
    } catch {
        // Private window or blocked storage: the bar simply goes to the hubs, as before.
    }
    try {
        const map = readBySpace()
        delete map[space]
        map[space] = project // re-inserted last, so the oldest is the first key
        const keys = Object.keys(map)
        for (const old of keys.slice(0, Math.max(0, keys.length - KEEP))) delete map[old]
        window.localStorage.setItem(BY_SPACE_KEY, JSON.stringify(map))
    } catch {
        // Blocked storage: the tab's memory above still works.
    }
}

const readBySpace = () => {
    try {
        const value = JSON.parse(window.localStorage.getItem(BY_SPACE_KEY) || 'null')
        if (value && typeof value === 'object' && !Array.isArray(value)) return value
    } catch {
        // fall through
    }
    return {}
}

// The last project stood in inside THIS space: this device's memory first, then
// this tab's. null when there is none or the storage is blocked.
export const readLastProjectOf = (space) => {
    if (!space) return null
    const own = readBySpace()[space]
    if (typeof own === 'string' && own) return own
    const tab = readLastProject()
    return tab.space === space ? tab.project : null
}

export const readLastProject = () => {
    try {
        const value = JSON.parse(window.sessionStorage.getItem(KEY) || 'null')
        if (value && typeof value.space === 'string' && typeof value.project === 'string') return value
    } catch {
        // fall through
    }
    return { space: null, project: null }
}
