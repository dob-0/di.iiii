import { useEffect, useRef } from 'react'
import './confirmDeleteDialog.css'

// Deleting is the one edit nobody else can take back: undo history is
// per-client and network-backed, so the person whose work disappeared has
// nothing to undo — only an admin rollback of the WHOLE space. Hence a
// confirm in front of every delete path, and a louder one when the thing
// belongs to somebody else.
//
// Not window.confirm: a native dialog blocks the event loop, which stops the
// automated checks dead and, on a phone, hands the decision to a system sheet
// nobody reads.

const quoted = (name) => `“${String(name || 'this object').trim() || 'this object'}”`

// The stamp is { subject, label }: subject is the session identity and the
// only half worth comparing, label is a name a person can change.
const authorSubject = (author) => (author && typeof author === 'object' ? String(author.subject || '') : '')
const authorLabel = (author) => (author && typeof author === 'object' ? String(author.label || '').trim() : '')

// Missing author means UNOWNED — everything made before the stamp landed has
// none. Never read that as "yours" and never as "someone else's".
export const foreignTargets = (targets = [], subjectId = '') => targets.filter((target) => {
    const subject = authorSubject(target?.author)
    if (!subject) return false
    return subject !== String(subjectId || '')
})

export const describeTargets = (targets = []) => {
    if (targets.length === 1) return `Delete ${quoted(targets[0]?.name)}?`
    return `Delete ${targets.length} objects?`
}

export const describeAuthors = (targets = [], subjectId = '') => {
    const foreign = foreignTargets(targets, subjectId)
    if (!foreign.length) return ''
    const names = [...new Set(foreign.map((target) => authorLabel(target.author)).filter(Boolean))]
    const who = names.length ? names.join(', ') : 'someone else'
    if (foreign.length === targets.length) {
        return `Made by ${who} — this is someone else's work, and it goes for them too.`
    }
    const count = foreign.length === 1 ? '1 of these was' : `${foreign.length} of these were`
    return `${count} made by ${who} — that is someone else's work, and it goes for them too.`
}

export default function ConfirmDeleteDialog({
    open,
    targets = [],
    subjectId = '',
    onConfirm,
    onCancel
}) {
    const cancelRef = useRef(null)

    useEffect(() => {
        if (!open) return undefined
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                onCancel?.()
                return
            }
            if (event.key !== 'Enter') return
            // Enter on the focused Cancel button is a cancel, not a confirm —
            // the browser fires that button's click itself.
            if (event.target === cancelRef.current) return
            event.preventDefault()
            event.stopPropagation()
            onConfirm?.()
        }
        window.addEventListener('keydown', handleKeyDown, true)
        return () => window.removeEventListener('keydown', handleKeyDown, true)
    }, [open, onCancel, onConfirm])

    if (!open || !targets.length) return null

    const warning = describeAuthors(targets, subjectId)
    const names = targets.map((target) => target?.name).filter(Boolean).join(', ')

    return (
        <div className="confirm-backdrop">
            <button
                type="button"
                className="confirm-scrim"
                aria-label="Cancel delete"
                onClick={() => onCancel?.()}
            />
            <section
                className={`confirm-dialog${warning ? ' is-someone-elses' : ''}`}
                role="dialog"
                aria-modal="true"
                aria-label="Confirm delete"
            >
                <h2 className="confirm-title">{describeTargets(targets)}</h2>
                {targets.length > 1 && names ? <p className="confirm-names">{names}</p> : null}
                {warning
                    ? <p className="confirm-warning">{warning}</p>
                    : <p className="confirm-body">It goes for everyone in this space.</p>}
                <div className="confirm-actions">
                    <button
                        type="button"
                        className="confirm-action"
                        ref={cancelRef}
                        onClick={() => onCancel?.()}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="confirm-action is-danger"
                        // Focused on open so Enter confirms and a keyboard-only
                        // person never has to reach for a pointer.
                        ref={(el) => el?.focus()}
                        onClick={() => onConfirm?.()}
                    >
                        Delete
                    </button>
                </div>
            </section>
        </div>
    )
}
