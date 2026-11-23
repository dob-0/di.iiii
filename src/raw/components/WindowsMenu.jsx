import { useEffect, useRef, useState } from 'react'
import '../../perform/perform.css'

// WINDOWS — the visible way back to a node window. Closing a window (the ×,
// or Esc on one the person opened) is saved per device, and until now the
// only way back was the Ctrl+K palette. This lists every window of the level,
// open ones ticked, hidden ones not; choosing one shows it (or, if it is open,
// brings it to the middle of the screen); "Show all windows" brings every
// hidden one back. It wears Perform's menu classes: one menu look.
//
//   items   [{ id, label, hint, open }]
export default function WindowsMenu({ items = [], onChoose, onShowAll }) {
    const [open, setOpen] = useState(false)
    const anchor = useRef(null)
    useEffect(() => {
        if (!open) return undefined
        const close = (refocus) => {
            setOpen(false)
            if (refocus) anchor.current?.querySelector('button')?.focus()
        }
        const onKey = (event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true) } }
        const onDown = (event) => { if (anchor.current && !anchor.current.contains(event.target)) close(false) }
        window.addEventListener('keydown', onKey, true)
        window.addEventListener('pointerdown', onDown)
        return () => {
            window.removeEventListener('keydown', onKey, true)
            window.removeEventListener('pointerdown', onDown)
        }
    }, [open])
    const hidden = items.filter((item) => !item.open).length
    return (
        <span className="perform-menu-anchor" ref={anchor}>
            <button
                type="button"
                className="sbar-link raw-windows-button"
                aria-haspopup="true"
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
            >Windows{hidden > 0 ? ` · ${hidden} hidden` : ''}</button>
            {open ? (
                <div className="perform-menu" role="menu" aria-label="Windows">
                    <div className="perform-menu-group">
                        {items.length ? items.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                role="menuitemcheckbox"
                                aria-checked={item.open}
                                className={`perform-menu-item${item.open ? ' is-on' : ''}`}
                                onClick={() => { onChoose?.(item.id); setOpen(false) }}
                            >
                                <span aria-hidden="true">{item.open ? '✓ ' : '  '}</span>{item.label}
                                <span className="perform-menu-note">{item.open ? 'open · bring here' : 'hidden'}</span>
                            </button>
                        )) : <p className="perform-menu-empty">No windows in this level.</p>}
                    </div>
                    <div className="perform-menu-group perform-menu-sep">
                        <button type="button" role="menuitem" className="perform-menu-item" disabled={hidden === 0} onClick={() => { onShowAll?.(); setOpen(false) }}>Show all windows</button>
                    </div>
                </div>
            ) : null}
        </span>
    )
}
