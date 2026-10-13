// The visitor's Move control: how fast and how the view moves (the standard move, studio/navigation/freeMove.js), in the
// corner with Walk / Fly, Inside and Lite / Full. One small button; it opens a card with the two settings and nothing else —
// Speed (empty is Auto, a number is metres a wheel step) and Turn (around a point ahead, or where you stand). The same two
// the Studio's Scene window has, written to the same per-device preference, so what is set in one holds in the other.
// Loaded lazily (PublicProjectViewer.jsx): it reads the move's own speed reading, which comes with three.
import { useEffect, useId, useRef, useState } from 'react'
import { overlayButtonStyle, overlayCardStyle } from './publicViewerStyles.js'
import { TURN_MODES } from '../../studio/navigation/freeMove.js'
import { MOVE_HINT, SPEED_LABEL, TURN_LABELS, autoLabel, metresText, useMoveSettings, useSpeedField } from '../../studio/navigation/useMoveSettings.js'

const CYAN = 'var(--di-cyan, #4df9ff)'
const lit = { background: 'rgba(77, 249, 255, 0.22)', border: `1px solid ${CYAN}`, color: CYAN }

const card = {
    ...overlayCardStyle,
    position: 'absolute',
    top: 'calc(100% + 0.4rem)',
    right: 0,
    zIndex: 21,
    boxSizing: 'border-box',
    width: '17.5rem',
    maxWidth: 'calc(100vw - 2rem)',
    padding: '0.6rem',
    display: 'grid',
    // one column that may shrink: without it the row's two items (the field and Auto) keep their natural width and run past the card
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: '0.35rem',
    textAlign: 'left'
}
const caption = { fontSize: '0.75rem', color: 'rgba(245, 247, 250, 0.62)' }
const row = { display: 'flex', gap: '0.35rem', alignItems: 'stretch' }
const field = {
    ...overlayButtonStyle,
    boxSizing: 'border-box',
    flex: 1,
    minWidth: 0,
    minHeight: 40,
    padding: '0 0.6rem',
    fontFamily: 'inherit',
    fontSize: '0.9rem',
    cursor: 'text'
}
const choice = { ...overlayButtonStyle, boxSizing: 'border-box', flex: 1, minHeight: 44, padding: '0 0.5rem', fontFamily: 'inherit', fontSize: '0.85rem', lineHeight: 1.2 }

export default function MoveControl({ buttonStyle = overlayButtonStyle, wrapStyle = { position: 'relative' } }) {
    const [open, setOpen] = useState(false)
    const wrap = useRef(null)
    const trigger = useRef(null)
    const speedId = useId()
    const { speed, turn, setSpeed, setTurn, isAuto, auto } = useMoveSettings()
    const speedField = useSpeedField({ speed, setSpeed })

    // The card closes on a press anywhere else (a drag in the room, the next button) and on Escape.
    useEffect(() => {
        if (!open) return undefined
        const away = (event) => { if (!wrap.current?.contains(event.target)) setOpen(false) }
        const onKey = (event) => {
            if (event.key !== 'Escape') return
            setOpen(false)
            trigger.current?.focus()
        }
        document.addEventListener('pointerdown', away, true)
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('pointerdown', away, true)
            document.removeEventListener('keydown', onKey)
        }
    }, [open])

    return (
        <div ref={wrap} style={wrapStyle}>
            <button
                ref={trigger}
                type="button"
                aria-expanded={open}
                title={MOVE_HINT}
                style={{ ...buttonStyle, minWidth: 104, minHeight: 44, ...(open ? lit : null) }}
                onClick={() => setOpen((was) => !was)}
            >
                Move
            </button>
            {open ? (
                <div role="group" aria-label="Move" style={card}>
                    <label htmlFor={speedId} style={caption}>{SPEED_LABEL}</label>
                    <div style={row}>
                        <input
                            id={speedId}
                            type="number"
                            inputMode="decimal"
                            step="any"
                            style={field}
                            placeholder={metresText(auto) || 'metres'}
                            value={speedField.value}
                            onChange={speedField.onChange}
                            onBlur={speedField.onBlur}
                        />
                        <button type="button" aria-pressed={isAuto} title="Set from the size of the space" style={{ ...choice, flex: '0 0 auto', minHeight: 40, ...(isAuto ? lit : null) }} onClick={speedField.reset}>
                            {autoLabel(auto)}
                        </button>
                    </div>
                    <span style={caption}>Turn</span>
                    <div style={row} role="group" aria-label="Turn">
                        {TURN_MODES.map((mode) => (
                            <button key={mode} type="button" aria-pressed={turn === mode} style={{ ...choice, ...(turn === mode ? lit : null) }} onClick={() => setTurn(mode)}>
                                {TURN_LABELS[mode]}
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    )
}
