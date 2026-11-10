// The last project the person stood in, kept for this browser tab only.
// Tools and Wiki are not inside a project, so their bar used to send Studio and
// Nodes to the global hubs and the project was lost on the way (route audit,
// 2026-11-10). Every bar that has a project remembers it; those two pages read it.
const KEY = 'dii.lastProject'

export const rememberProject = (space, project) => {
    if (!space || !project) return
    try {
        window.sessionStorage.setItem(KEY, JSON.stringify({ space, project }))
    } catch {
        // Private window or blocked storage: the bar simply goes to the hubs, as before.
    }
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
