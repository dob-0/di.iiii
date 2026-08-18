// Zen: the workspace with nothing resident on it. Surface, nodes, and whatever
// you summon — no topbar, no zoom buttons, no help or chat button sitting there
// waiting to be needed.
//
// Deliberately a per-device VIEW preference in localStorage, not document state:
// one collaborator choosing zen must not strip the topbar from everyone else in
// the same project. The window layout stays where it already lives (node
// values.frame, per document).

const KEY_PREFIX = 'dii.raw.zen.'

const storageKey = (workspaceKey) => `${KEY_PREFIX}${workspaceKey || 'default'}`

/**
 * Zen is the default for a NEW workspace and never for one that already has
 * work in it — turning the chrome off under an arrangement somebody already
 * built is not a default, it is a change to their workspace.
 */
export const defaultZenFor = ({ nodeCount = 0 } = {}) => nodeCount === 0

export const readZenPreference = (workspaceKey, { nodeCount = 0, defaultZen, storage } = {}) => {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : null)
    let stored = null
    try {
        stored = store?.getItem(storageKey(workspaceKey)) ?? null
    } catch {
        // Private-mode browsers throw on access rather than returning null.
        stored = null
    }
    if (stored === 'on') return true
    if (stored === 'off') return false
    // A caller that seeded the workspace itself may override the default: the
    // starter constellation is not "an arrangement somebody already built", so
    // a seeded first visit still opens bare. A stored choice always wins.
    if (typeof defaultZen === 'boolean') return defaultZen
    return defaultZenFor({ nodeCount })
}

export const writeZenPreference = (workspaceKey, zen, { storage } = {}) => {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : null)
    try {
        store?.setItem(storageKey(workspaceKey), zen ? 'on' : 'off')
    } catch {
        // A workspace that cannot remember the choice must still honour it for
        // this session, so a failed write is not an error worth surfacing.
    }
}

/**
 * Read the preference and remember the answer, so the default is decided ONCE
 * per workspace instead of being re-derived on every load. Without the write,
 * an empty workspace opens zen and then the chrome reappears by itself as soon
 * as the workspace has a node in it — a setting that changes itself.
 */
export const resolveZenPreference = (workspaceKey, { nodeCount = 0, defaultZen, storage } = {}) => {
    const resolved = readZenPreference(workspaceKey, { nodeCount, defaultZen, storage })
    writeZenPreference(workspaceKey, resolved, { storage })
    return resolved
}

/**
 * Does this keystroke mean "open the palette"?
 *
 * Cmd/Ctrl+K, or a bare `/` — but never while the person is typing into
 * something, or `/` would be unusable in any text field in the workspace.
 */
export const isPaletteSummons = (event) => {
    if (!event) return false
    const target = event.target
    const tag = target?.tagName?.toLowerCase?.()
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable
    if (event.key === 'k' && (event.metaKey || event.ctrlKey)) return true
    if (typing) return false
    // A modified slash is somebody's browser shortcut, not this one.
    return event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey
}
