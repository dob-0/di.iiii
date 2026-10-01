import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './syncLight.css'
import useSyncStatus from './useSyncStatus.js'
import InviteAMachine from './InviteAMachine.jsx'
import { stopFollowing } from './syncApi.js'
import { displayName, syncLight, syncPanel } from './syncLight.js'

/**
 * The sync light in a space's bar, and the panel behind it.
 *
 * Owner-approved sketch A + C (2026-10-01). It shows only when this install
 * follows the space or is followed by someone — and for a visitor, or on an
 * install that shares nothing, it renders nothing at all. What it says is
 * decided in syncLight.js; this file only draws it and wires the two buttons.
 *
 * "Invite a machine" makes a four-word code (valid 10 minutes, one space, once)
 * through POST /api/spaces/:id/join-codes. The words are shown HERE, once; the
 * server keeps only a hash of them.
 */

const CODE_VIEW = 'code'

function useRect(ref, active) {
    const [rect, setRect] = useState(null)
    useLayoutEffect(() => {
        if (!active || !ref.current) return undefined
        const read = () => {
            const bar = ref.current.closest?.('.sbar') || ref.current
            const box = bar.getBoundingClientRect()
            const chip = ref.current.getBoundingClientRect()
            setRect({ top: box.bottom, right: Math.max(8, window.innerWidth - chip.right) })
        }
        read()
        window.addEventListener('resize', read)
        return () => window.removeEventListener('resize', read)
    }, [ref, active])
    return rect
}

export default function SyncLight({ space, onShown = () => {} }) {
    const [open, setOpen] = useState(false)
    const [view, setView] = useState('panel')
    const [confirmStop, setConfirmStop] = useState(false)
    const [stopError, setStopError] = useState(null)
    const chipRef = useRef(null)
    const panelRef = useRef(null)
    const { status, now, refresh } = useSyncStatus(space, { fast: open && view === CODE_VIEW })
    const light = syncLight(status, now)
    const rect = useRect(chipRef, open && Boolean(light))

    const shown = Boolean(light)
    useEffect(() => { onShown(shown) }, [shown, onShown])
    useEffect(() => () => onShown(false), [onShown])

    const close = useCallback(() => { setOpen(false); setView('panel'); setConfirmStop(false); setStopError(null) }, [])

    useEffect(() => {
        if (!open) return undefined
        const onKey = (event) => { if (event.key === 'Escape') close() }
        const onDown = (event) => {
            if (panelRef.current?.contains(event.target) || chipRef.current?.contains(event.target)) return
            close()
        }
        window.addEventListener('keydown', onKey)
        window.addEventListener('pointerdown', onDown)
        return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onDown) }
    }, [open, close])

    if (!light) return null

    const panel = syncPanel(status, now)
    const hostName = displayName(status.follows?.host?.name).toLowerCase()

    const stop = async () => {
        try {
            await stopFollowing(space)
            close()
            refresh()
        } catch (failure) {
            setStopError(failure?.message || 'Could not stop following.')
        }
    }

    return (
        <div className="sbar-sync">
            <button
                type="button"
                ref={chipRef}
                className={`slight slight--${light.tone}`}
                aria-haspopup="dialog"
                aria-expanded={open}
                title={light.text}
                data-sync-state={light.state}
                onClick={() => { setOpen((was) => !was); setView('panel'); setConfirmStop(false) }}
            >
                <span className="slight-lamp" aria-hidden="true" />
                <span className="slight-text">{light.text}</span>
            </button>
            {open && rect && typeof document !== 'undefined' && createPortal(
                <div
                    ref={panelRef}
                    className="spanel"
                    role="dialog"
                    aria-label="Sync with other machines"
                    style={{ top: rect.top + 4, right: rect.right }}
                >
                    {view === CODE_VIEW ? (
                        <InviteAMachine space={space} onChange={refresh} onBack={() => setView('panel')} />
                    ) : (
                        <>
                            <p className="spanel-label">{panel.title}</p>
                            {panel.rows.map(([what, value]) => (
                                <div className="spanel-row" key={what}>
                                    <span>{what}</span>
                                    <span>{value}</span>
                                </div>
                            ))}
                            {panel.note && <p className="spanel-note">{panel.note}</p>}
                            {stopError && <p className="spanel-error" role="alert">{stopError}</p>}
                            {confirmStop ? (
                                <>
                                    <p className="spanel-note">
                                        Stop following {hostName}? Edits stop crossing. Nothing here is deleted, and you can follow again with a new invite.
                                    </p>
                                    <div className="spanel-actions">
                                        <button type="button" className="sbtn" onClick={stop}>Stop following</button>
                                        <button type="button" className="sbtn sbtn--quiet" onClick={() => setConfirmStop(false)}>Keep following</button>
                                    </div>
                                </>
                            ) : (
                                <div className="spanel-actions">
                                    <button type="button" className="sbtn" onClick={() => setView(CODE_VIEW)}>Invite a machine</button>
                                    {panel.canStopFollowing && (
                                        <button type="button" className="sbtn sbtn--quiet" onClick={() => setConfirmStop(true)}>Stop following</button>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>,
                document.body
            )}
        </div>
    )
}

