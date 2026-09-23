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
 *
 * `workCount` is WORK, both kinds: nodes AND things (the room's objects). It
 * was `nodeCount`, and a project of twelve Studio things counted as zero, so it
 * opened chromeless — no toolbar, no outliner, nothing but the canvas — the
 * project with the most in it got the least interface. First renamed on the
 * branch worktree-connect-graph-walk (8c58c29a); brought onto dev with unit 6
 * of decisions/2026-09-23-layers-what-inside-what.md.
 */
export const defaultZenFor = ({ workCount = 0 } = {}) => workCount === 0

export const readZenPreference = (workspaceKey, { workCount = 0, defaultZen, storage } = {}) => {
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
    // A DERIVED default, not a choice: zen switched itself on because the
    // canvas was empty at the time. The premise is re-checked on every read —
    // the moment the canvas has work in it, the chrome belongs back. Only an
    // explicit toggle writes the unconditional 'on'.
    if (stored === 'auto-on') return workCount === 0
    // A caller that seeded the workspace itself may override the default: the
    // starter constellation is not "an arrangement somebody already built", so
    // a seeded first visit still opens bare. A stored choice always wins.
    if (typeof defaultZen === 'boolean') return defaultZen
    return defaultZenFor({ workCount })
}

/**
 * A zen a person CHOSE on this device ('on' or 'off'), or null when there is
 * only the derived default (nothing stored, or 'auto-on'). A choice does not
 * depend on what the project holds, so it can be honoured at once; only the
 * derived default has to wait for the project to load.
 */
export const readChosenZen = (workspaceKey, { storage } = {}) => {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : null)
    let stored = null
    try {
        stored = store?.getItem(storageKey(workspaceKey)) ?? null
    } catch {
        stored = null
    }
    if (stored === 'on') return true
    if (stored === 'off') return false
    return null
}

export const writeZenPreference = (workspaceKey, zen, { storage, derived = false } = {}) => {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : null)
    try {
        store?.setItem(storageKey(workspaceKey), zen ? (derived ? 'auto-on' : 'on') : 'off')
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
export const resolveZenPreference = (workspaceKey, { workCount = 0, defaultZen, storage } = {}) => {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : null)
    let stored = null
    try {
        stored = store?.getItem(storageKey(workspaceKey)) ?? null
    } catch {
        stored = null
    }
    const resolved = readZenPreference(workspaceKey, { workCount, defaultZen, storage })
    // An explicit choice stays exactly as written. A derived zen-on is
    // remembered as 'auto-on' — stable across reloads of an empty canvas,
    // but honest that nobody chose it, so the first node can lift it (the
    // 08-21 audit's trap: the Scene button stayed invisible all session
    // because the derived default had been stored as if it were a choice).
    if (stored !== 'on' && stored !== 'off') {
        writeZenPreference(workspaceKey, resolved, { storage, derived: resolved === true })
    }
    return resolved
}

/**
 * The canvas just stopped being empty. If zen is only on because of the
 * derived empty-canvas default (stored 'auto-on'), lift it: write 'off' and
 * answer true so the caller re-shows the chrome. An explicit 'on' is a
 * person's choice and is never touched.
 */
export const liftAutoZen = (workspaceKey, { storage } = {}) => {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : null)
    let stored = null
    try {
        stored = store?.getItem(storageKey(workspaceKey)) ?? null
    } catch {
        stored = null
    }
    if (stored !== 'auto-on') return false
    writeZenPreference(workspaceKey, false, { storage })
    return true
}

/**
 * Is zen on only because the canvas was empty (stored 'auto-on'), not because
 * a person chose it? The one bar above the canvas stays for an automatic zen —
 * an empty project is the first thing a newcomer sees, and a canvas with no
 * way out is the dead end the stranger's walk found (2026-09-22). A chosen zen
 * hides the bar with the rest of the chrome.
 */
export const isAutoZen = (workspaceKey, { storage } = {}) => {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : null)
    try {
        return (store?.getItem(storageKey(workspaceKey)) ?? null) === 'auto-on'
    } catch {
        return false
    }
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
