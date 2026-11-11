import { useEffect, useMemo, useRef, useState } from 'react'
import useDocumentTitle from '../../hooks/useDocumentTitle.js'
import { applyEvents, createK2Feed, emptyState, stateFromSnapshot } from './k2Channel.js'
import { faceOfController, jobBox, shapeBox, unionBox, wrapJob } from './k2Face.js'
import './k2Window.css'

// THE CONTROLLER WINDOW: the K2 drawn as a picture of itself, every control saying what it does now,
// moving live. READ ONLY and fed ONLY by the deck page over k2Channel.js: it never asks for MIDI,
// writes no document, triggers nothing. It draws any controller that has a face (xone-k2-face.json).
// Drawing rules and sizes: k2Window.css. The face is in face units; the viewBox scales it.

const MARGIN = 4
const FLASH_MS = 300
const HINT = 'Hover or Tab to a control to see what it does. Click to pin it.'
const NO_FEED = {}

const lightClass = (light) => (light === 'red' || light === 'amber' || light === 'green' ? ` is-${light}` : '')

function Shape({ control, value, held, flash, light }) {
    const { kind, x, y, size } = control
    const half = size / 2
    const lit = lightClass(light)
    const cls = `k2w-shape${lit}${held ? ' is-held' : ''}${flash ? ' is-flash' : ''}`
    if (kind === 'knob') {
        const angle = Number.isFinite(value) && control.mode !== 'relative' ? -135 + (Math.min(127, Math.max(0, value)) / 127) * 270 : 0
        return (
            <g>
                <circle className={`${cls} k2w-knob`} cx={x} cy={y} r={half} />
                <line className="k2w-mark" x1={x} y1={y} x2={x} y2={y - half + 1} transform={`rotate(${angle} ${x} ${y})`} />
            </g>
        )
    }
    if (kind === 'push') return <circle className={`${cls} k2w-push`} cx={x} cy={y} r={half} />
    if (kind === 'fader') {
        const length = control.length || size
        const top = y - length / 2
        const capY = Number.isFinite(value) ? top + length - (Math.min(127, Math.max(0, value)) / 127) * length : top + length
        return (
            <g>
                <rect className="k2w-slot" x={x - 1} y={top} width={2} height={length} />
                <rect className={`${cls} k2w-cap`} x={x - 4} y={capY - 2.5} width={8} height={5} />
            </g>
        )
    }
    return <rect className={`${cls} k2w-${kind}`} x={x - half} y={y - half} width={size} height={size} />
}

export default function K2Window({ makeChannel, setTimer, clearTimer, now }) {
    useDocumentTitle('Controller')
    const [snapshot, setSnapshot] = useState(null)
    const [status, setStatus] = useState('')
    const [state, setState] = useState(emptyState)
    const [hover, setHover] = useState('')
    const [focus, setFocus] = useState('')
    const [pinned, setPinned] = useState('')
    const flashTimer = useRef(null)

    useEffect(() => {
        const feed = createK2Feed({
            ...(makeChannel ? { makeChannel } : NO_FEED),
            ...(setTimer ? { setTimer } : NO_FEED),
            ...(clearTimer ? { clearTimer } : NO_FEED),
            ...(now ? { now } : NO_FEED),
            onStatus: setStatus,
            onSnapshot: (next) => { setSnapshot(next); setState(stateFromSnapshot(next)) },
            onEvents: (events) => {
                setState((current) => applyEvents(current, events))
                if (flashTimer.current) clearTimeout(flashTimer.current)
                flashTimer.current = setTimeout(() => setState((current) => ({ ...current, flash: {} })), FLASH_MS)
            }
        })
        return () => {
            if (flashTimer.current) clearTimeout(flashTimer.current)
            feed.close()
        }
    }, [makeChannel, setTimer, clearTimer, now])

    useEffect(() => {
        const onKey = (event) => { if (event.key === 'Escape') setPinned('') }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [])

    const face = faceOfController(snapshot?.controller)
    const names = useMemo(() => (face ? Object.keys(face.controls) : []), [face])
    const shown = pinned || hover || focus
    const labels = snapshot?.labels || {}
    const lines = snapshot?.lines || {}
    const analog = (name) => face?.controls[name]?.kind === 'fader' || (face?.controls[name]?.kind === 'knob' && face.controls[name].mode !== 'relative')
    const readout = shown
        ? `${lines[shown] || shown}${analog(shown) && Number.isFinite(state.values[shown]) ? ` · value ${state.values[shown]}` : ''}`
        : HINT

    let body
    if (!snapshot) {
        body = <p className="k2w-wait" role="status">{status === 'waiting' ? 'Waiting for the deck page. Open the deck with its K2 connected, then press Device in the K2 panel.' : 'Asking the deck page...'}</p>
    } else if (!face) {
        body = <p className="k2w-wait" role="status">No picture for this controller yet.</p>
    } else {
        const text = face.text
        body = (
            <svg className="k2w-svg" viewBox={`${-MARGIN} ${-MARGIN} ${face.body.width + 2 * MARGIN} ${face.body.height + 2 * MARGIN}`} role="group" aria-label={`${snapshot.consoleName} controller`}>
                <rect className="k2w-body" x={0} y={0} width={face.body.width} height={face.body.height} />
                <rect className="k2w-plate" x={3} y={3} width={face.body.width - 6} height={face.body.height - 6} />
                {names.map((name) => {
                    const control = face.controls[name]
                    const job = labels[name] ?? ''
                    const unused = job === 'not used'
                    const room = unionBox(shapeBox(control), jobBox(control, text))
                    const inside = control.kind === 'pad'
                    const jobLines = wrapJob(job, text)
                    const printed = control.printed ? control.printed.split(' ') : []
                    const value = state.values[name]
                    const held = Boolean(state.held[name])
                    const lit = lightClass(snapshot.lights?.[name]).length > 0 || held
                    const jobY = control.jobTop + text.lineHeight * 0.8
                    return (
                        <g
                            key={name}
                            className={`k2w-control k2w-${control.kind}-group${unused ? ' is-unused' : ''}${pinned === name ? ' is-pinned' : ''}${lit ? ' is-lit' : ''}`}
                            data-control={name}
                            data-value={Number.isFinite(value) ? value : undefined}
                            role="button"
                            tabIndex={0}
                            aria-pressed={pinned === name}
                            aria-label={`${name}: ${job}`}
                            onMouseEnter={() => setHover(name)}
                            onMouseLeave={() => setHover((current) => (current === name ? '' : current))}
                            onFocus={() => setFocus(name)}
                            onBlur={() => setFocus((current) => (current === name ? '' : current))}
                            onClick={() => setPinned((current) => (current === name ? '' : name))}
                            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setPinned((current) => (current === name ? '' : name)) } }}
                        >
                            <rect className="k2w-ring" x={room.left - 0.5} y={room.top - 0.5} width={room.right - room.left + 1} height={room.bottom - room.top + 1} />
                            <Shape control={control} value={value} held={held} flash={Boolean(state.flash[name])} light={snapshot.lights?.[name]} />
                            {printed.map((word, index) => (inside
                                ? <text key={word} className="k2w-printed" x={control.x - control.size / 2 + 2} y={control.y - control.size / 2 + text.size} textAnchor="start" fontSize={text.size}>{word}</text>
                                : <text key={word} className="k2w-printed" x={control.x} y={control.y + (index - (printed.length - 1) / 2) * text.lineHeight + text.size * 0.35} textAnchor="middle" fontSize={text.size}>{word}</text>))}
                            <text className="k2w-job" x={control.x} y={jobY} textAnchor="middle" fontSize={text.size} data-job>
                                {jobLines.map((line, index) => <tspan key={index} x={control.x} dy={index === 0 ? 0 : text.lineHeight}>{line}</tspan>)}
                            </text>
                        </g>
                    )
                })}
            </svg>
        )
    }

    return (
        <div className="k2w" data-status={snapshot ? 'live' : status || 'asking'}>
            <header className="k2w-head">
                <h1 className="k2w-title">{snapshot ? `${snapshot.controller} · ${snapshot.consoleName}` : 'Controller'}</h1>
                <span className="k2w-status" role="status">{snapshot ? (status === 'waiting' ? 'deck page not answering' : 'live') : (status === 'waiting' ? 'waiting for the deck page' : 'asking')}</span>
            </header>
            <main className="k2w-main">{body}</main>
            <p className="k2w-readout" role="status" aria-live="polite" data-readout>{readout}</p>
        </div>
    )
}
