import { useEffect, useRef, useState } from 'react'

// "Is my work stored?" in words, not a colour (UX audit F089, Nielsen H1 visibility of system status).
// Three states, read from what the sync layer already knows (useProjectDocumentSync):
//   Not saved  - a sync failure is waiting (offline, or the sign-in ran out); what to do is said beside it.
//   Saving...  - edits are on their way to the server and not yet acknowledged.
//   Saved 14:32 - nothing waits. The time is the last moment waiting edits were acknowledged; before this
//                 page has sent any, it is just "Saved" (the project came from the server).
export function saveLineText(syncState, savedAt = null) {
    if (!syncState) return ''
    if (syncState.pendingSyncError || syncState.authExpired) {
        return syncState.authExpired
            ? 'Not saved: sign in again'
            : 'Not saved: offline, keep this tab open'
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
    const failed = Boolean(syncState?.pendingSyncError || syncState?.authExpired)
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
            role="status"
            aria-live="polite"
            data-save-state={state}
            title={syncState?.pendingSyncError || undefined}
        >
            {text}
        </div>
    )
}
