import { useEffect, useId, useRef, useState } from 'react'
import './ui.css'

// di.iiii's own question box. When something could be lost, ask here (named
// buttons, Esc says no) instead of the browser's grey pop-up, which blocks the
// page, cannot be styled or translated, and says only "OK / Cancel".
//
// Props: open, title, body, confirmLabel (a verb, never "OK"), cancelLabel,
// danger (focus starts on the safe button), input = { label, defaultValue }
// turns it into a one-line question; onConfirm(value) gets the text then.

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

// Mounted only while open, so every question starts fresh: the field shows its
// own defaultValue, never text typed into an earlier question.
export default function AskDialog({ open, ...props }) {
    return open ? <AskBox {...props} /> : null
}

function AskBox({
    title,
    body = '',
    confirmLabel = 'Yes',
    cancelLabel = 'Cancel',
    danger = false,
    input = null,
    onConfirm,
    onCancel
}) {
    const id = useId()
    const dialogRef = useRef(null)
    const cancelRef = useRef(null)
    const confirmRef = useRef(null)
    const inputRef = useRef(null)
    const [value, setValue] = useState(input?.defaultValue ?? '')

    useEffect(() => {
        const before = document.activeElement
        // Safe default: a danger question starts on the "no" button.
        const first = input ? inputRef.current : (danger ? cancelRef.current : confirmRef.current)
        first?.focus()
        return () => { if (before && before.isConnected) before.focus?.() }
    }, [danger, input])

    useEffect(() => {
        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                onCancel?.()
                return
            }
            if (event.key !== 'Tab') return
            const nodes = [...(dialogRef.current?.querySelectorAll(FOCUSABLE) || [])]
            if (!nodes.length) return
            const first = nodes[0]
            const last = nodes[nodes.length - 1]
            const active = document.activeElement
            if (!dialogRef.current?.contains(active)) {
                event.preventDefault()
                first.focus()
            } else if (event.shiftKey && active === first) {
                event.preventDefault()
                last.focus()
            } else if (!event.shiftKey && active === last) {
                event.preventDefault()
                first.focus()
            }
        }
        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
    }, [onCancel])

    const submit = (event) => {
        event?.preventDefault()
        onConfirm?.(input ? value : undefined)
    }

    return (
        <div className="di-ask-backdrop">
            <button type="button" className="di-ask-scrim" tabIndex={-1} aria-label="Close this question" onClick={() => onCancel?.()} />
            <form
                ref={dialogRef}
                className={`di-ask-dialog${danger ? ' is-danger' : ''}`}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={`${id}-title`}
                aria-describedby={body ? `${id}-body` : undefined}
                onSubmit={submit}
            >
                <h2 className="di-ask-title" id={`${id}-title`}>{title}</h2>
                {body ? <p className="di-ask-body" id={`${id}-body`}>{body}</p> : null}
                {input ? (
                    <label className="di-ask-field">
                        {input.label}
                        <input
                            ref={inputRef}
                            className="di-ask-input"
                            type="text"
                            value={value}
                            onChange={(event) => setValue(event.target.value)}
                        />
                    </label>
                ) : null}
                <div className="di-ask-actions">
                    <button type="button" className="di-ask-button" ref={cancelRef} onClick={() => onCancel?.()}>
                        {cancelLabel}
                    </button>
                    <button type="submit" className={`di-ask-button${danger ? ' is-danger' : ''}`} ref={confirmRef}>
                        {confirmLabel}
                    </button>
                </div>
            </form>
        </div>
    )
}
