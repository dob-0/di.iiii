import { useEffect, useRef, useState } from 'react'

// "Is my work stored?" in words, not a colour (UX audit F089, Nielsen H1 visibility of system status).
// Three states, read from what the sync layer already knows (useProjectDocumentSync):
//   Not saved  - a sync failure is waiting (offline, the sign-in ran out, or the server refused and it retries);
//                what to do is said beside it.
//   Saving...  - edits are on their way to the server and not yet acknowledged.
//   Saved 14:32 - nothing waits. The time is the last moment waiting edits were acknowledged; before this
//                 page has sent any, it is just "Saved" (the project came from the server).
export function saveLineText(syncState, savedAt = null) {
    if (!syncState) return ''
    // Before the project's own document has arrived there is nothing to call saved. hasLoaded is
    // false (not just missing) from the store until load-success; callers that do not know pass nothing.
    if (syncState.hasLoaded === false && !syncState.pendingSyncError && !syncState.authExpired) {
        return syncState.loadError ? 'Not opened: reload this page' : ''
    }
    if (syncState.pendingSyncError || syncState.authExpired) {
        if (syncState.authExpired) return 'Not saved: sign in again'
        // "offline" only when the server could not be reached: describeFailure in
        // src/project/hooks/useProjectDocumentSync.js words that case 'server unreachable'.
        // Any other failure (a refusal, a conflict that keeps coming back) is retried
        // by the sync layer, and the line must not send a pro to check the network.
        return /server unreachable/i.test(String(syncState.pendingSyncError || ''))
            ? 'Not saved: offline, keep this tab open'
            : 'Not saved: trying again, keep this tab open'
    }
    if ((Number(syncState.pendingOpCount) || 0) > 0) return 'Saving…'
    if (!savedAt) return 'Saved'
    const hh = String(savedAt.getHours()).padStart(2, '0')
    const mm = String(savedAt.getMinutes()).padStart(2, '0')
    return `Saved ${hh}:${mm}`
}

export default function StudioSaveLine({ syncState, className = '', now = () => new Date() }) {
    const [savedAt, setSavedAt] = useState(null)
    const waiting = (Number(syncState?.pendingOpCount) || 0) > 0
    const loadFailed = syncState?.hasLoaded === false && Boolean(syncState?.loadError)
    const failed = Boolean(syncState?.pendingSyncError || syncState?.authExpired || loadFailed)
    const wasWaiting = useRef(false)
    useEffect(() => {
        if (wasWaiting.current && !waiting && !failed) setSavedAt(now())
        wasWaiting.current = waiting
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [waiting, failed])

    const text = saveLineText(syncState, savedAt)
    if (!text) return null
    const state = failed ? 'error' : waiting ? 'saving' : 'saved'
    return (
        <div
            className={`${className} di-save-line di-save-line--${state}`.trim()}
            // A screen reader hears a problem, not every slider tick: Saving... and Saved flip on each edit.
            role={failed ? 'status' : undefined}
            aria-live={failed ? 'polite' : 'off'}
            data-save-state={state}
            title={syncState?.pendingSyncError || undefined}
        >
            {text}
        </div>
    )
}
