// One-shot handoff for "open this project and land inside node X" — used by
// RawHub's "open studio" shortcut, which creates/finds a project holding a
// Studio container and wants the editor to land inside it rather than at the
// document root. Scope (useNodeGraphScope's navStack) is deliberately client-
// local, not part of the synced document (no forced root type — product
// decision 2026-07-17, see RawEditor.jsx), so this can't ride in the document
// itself; sessionStorage carries it across the one navigation that needs it,
// then RawEditor consumes and clears it so a later reload starts at the root
// like any other project.
const STORAGE_KEY = 'dii.raw.enterNodeOnOpen'

const canUseStorage = () => typeof window !== 'undefined' && Boolean(window.sessionStorage)

export const stashRawEnterNode = (projectId, nodeId) => {
    if (!canUseStorage() || !projectId || !nodeId) return
    try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ projectId, nodeId }))
    } catch {
        // best-effort — worst case the editor opens at the document root
    }
}

// Non-destructive: safe to call from a lazy useState initializer, which
// StrictMode invokes twice on mount in dev — a destructive read there means
// the throwaway first invocation consumes the value and the real one always
// sees null. Callers clear it explicitly (clearRawEnterNode) once they've
// actually acted on it.
export const peekRawEnterNode = (projectId) => {
    if (!canUseStorage() || !projectId) return null
    try {
        const raw = window.sessionStorage.getItem(STORAGE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        return parsed?.projectId === projectId && parsed?.nodeId ? parsed.nodeId : null
    } catch {
        return null
    }
}

export const clearRawEnterNode = () => {
    if (!canUseStorage()) return
    try {
        window.sessionStorage.removeItem(STORAGE_KEY)
    } catch {
        // best-effort
    }
}
