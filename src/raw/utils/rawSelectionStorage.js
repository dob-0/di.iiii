// Selection is per VIEWER, never the shared document (fix #5 / design audit
// A4: workspaceState.selectedNodeId was written as a setWorkspaceState op, so
// whichever device or tab last clicked something chose what every OTHER
// viewer's editor opened with — a fresh browser opened with a stranger's
// Oscillator selected, and a phone opened with the inspector sheet covering
// 40% of the screen and Delete armed).
//
// sessionStorage carries it across a reload of THIS tab only, keyed per
// canvas so switching canvases in one session can't leak one canvas's
// selection into another's inspector. `workspaceKey` is the same identity
// RawEditor's own zen preference already keys by (`projectId || localStorageKey
// || 'default'`) — a server project by its id, a local/canvas-mode workspace
// by its storage key, so two different local canvases in the same browser
// never share one bucket. Same non-throwing, best-effort shape as
// rawEnterNodeHandoff.js's stash/peek — a lost selection on a private window
// or a storage quota error is an ordinary outcome, never a crash.
const STORAGE_PREFIX = 'dii.raw.selectedNode.'

const canUseStorage = () => typeof window !== 'undefined' && Boolean(window.sessionStorage)

const storageKey = (workspaceKey) => `${STORAGE_PREFIX}${workspaceKey || 'default'}`

export const readSelectedNodeId = (workspaceKey) => {
    if (!canUseStorage()) return null
    try {
        return window.sessionStorage.getItem(storageKey(workspaceKey)) || null
    } catch {
        return null
    }
}

export const writeSelectedNodeId = (workspaceKey, nodeId) => {
    if (!canUseStorage()) return
    try {
        if (nodeId) window.sessionStorage.setItem(storageKey(workspaceKey), nodeId)
        else window.sessionStorage.removeItem(storageKey(workspaceKey))
    } catch {
        // best-effort — worst case a reload opens with nothing selected
    }
}
