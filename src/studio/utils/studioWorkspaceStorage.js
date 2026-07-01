// Persists the floating-shell workspace (which panels are open, where they
// were dragged, edge snapping) so a Studio session picks up exactly where the
// user left off instead of resetting to the default two-panel layout.
const STORAGE_KEY = 'dii.studio.workspace.v1'

export function loadStudioWorkspace() {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object') return null
        return {
            open: Array.isArray(parsed.open) ? parsed.open.filter((id) => typeof id === 'string') : null,
            positions: parsed.positions && typeof parsed.positions === 'object' ? parsed.positions : null,
            snapEdges: typeof parsed.snapEdges === 'boolean' ? parsed.snapEdges : false,
        }
    } catch {
        return null
    }
}

export function saveStudioWorkspace({ open, positions, snapEdges }) {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
            open: [...open],
            positions,
            snapEdges,
        }))
    } catch { /* storage full or unavailable — layout just won't persist */ }
}

export function clearStudioWorkspace() {
    try {
        window.localStorage.removeItem(STORAGE_KEY)
    } catch { /* ignore */ }
}
