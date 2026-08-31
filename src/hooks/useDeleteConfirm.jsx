import { useCallback, useRef, useState } from 'react'
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog.jsx'
import { currentSubject } from '../project/authorship.js'

// One question in front of every delete path. `requestDelete(targets, apply)`
// holds `apply` until the person says yes; cancelling never runs it, so the
// document is not touched at all.
//
// targets: [{ id, name, author }] — author is the entity's or node's
// createdBy, or null for anything made before the stamp existed.
export function useDeleteConfirm() {
    const [pending, setPending] = useState(null)
    // The confirm callback is read synchronously on the click; keeping it in a
    // ref as well means it never runs inside a state updater, which React
    // calls twice in StrictMode — that would delete twice.
    const pendingRef = useRef(null)

    const requestDelete = useCallback((targets, apply) => {
        const list = (Array.isArray(targets) ? targets : [targets]).filter(Boolean)
        if (!list.length) return
        // Holding Delete, or pressing it again while the question is up, must
        // not stack a second question behind the first.
        if (pendingRef.current) return
        const next = { targets: list, subjectId: currentSubject(), apply }
        pendingRef.current = next
        setPending(next)
    }, [])

    const cancelDelete = useCallback(() => {
        pendingRef.current = null
        setPending(null)
    }, [])

    const confirmDelete = useCallback(() => {
        const current = pendingRef.current
        pendingRef.current = null
        setPending(null)
        current?.apply?.()
    }, [])

    return {
        requestDelete,
        deleteConfirm: (
            <ConfirmDeleteDialog
                open={Boolean(pending)}
                targets={pending?.targets || []}
                subjectId={pending?.subjectId || ''}
                onConfirm={confirmDelete}
                onCancel={cancelDelete}
            />
        )
    }
}

export default useDeleteConfirm
