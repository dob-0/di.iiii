import { useEffect, useState, useSyncExternalStore } from 'react'
import { jobOf, lineOf } from './k2Jobs.js'
import { faceOfConsole } from './k2Face.js'
import { K2_WINDOW_NAME } from './k2Channel.js'
import { TOUCH_MS, controlKey } from './k2Monitor.js'
import { K2_CONSOLES, XONE_K2_CONTROLS } from './xoneK2.js'
import './k2LayoutPanel.css'

// The Xone:K2 drawn as it is, every control labelled with what it does NOW (the effective
// map: the K2 default plus the person's own learned bindings), lighting up live from the
// controller (a monitor from useDeckMidi). Read only: mapping stays on right-click / MIDI mode.
//
// map      the effective map (useDeckMidi().map)
// monitor  useDeckMidi().k2Monitor (subscribe / getSnapshot)
// console  the active console { id, name, free } (K2 or K2 (1.9)); consoles = both; onPickConsole(id)
// onClose  () => void
// windowPath / publisher  where the controller window lives and the courier that feeds it (useDeckMidi().k2Publisher);
//          the Device button shows only when the console's controller has a drawn face (k2Face.js) and a path is given
// openWindow (url, name, features) => Window | null   window.open by default
// fxEffect which effect of the selected stack the third pot row turns (0-based)

const byName = new Map(XONE_K2_CONTROLS.map((item) => [item.control, item]))
const range = (count) => Array.from({ length: count }, (_, index) => index)
const MATRIX = 'ABCDEFGHIJKLMNOP'.split('').map((letter) => `matrix ${letter}`)

// Rows top to bottom, as the device is laid out; each row is four cells of control names.
const ROWS = [
    { id: 'knobs', title: 'Top encoders', cells: range(4).map((i) => [`encoder ${i + 1}`, `encoder ${i + 1} push`]) },
    ...range(3).map((row) => ({ id: `pots${row + 1}`, title: `Pot row ${row + 1}`, cells: range(4).map((i) => [`pot ${row * 4 + i + 1}`, `pot switch ${row * 4 + i + 1}`]) })),
    { id: 'faders', title: 'Faders', cells: range(4).map((i) => [`fader ${i + 1}`]) },
    ...range(4).map((row) => ({ id: `matrix${row + 1}`, title: `Buttons row ${row + 1}`, cells: range(4).map((i) => [MATRIX[row * 4 + i]]) })),
    { id: 'bottom', title: 'Bottom row', cells: [['layer button'], ['encoder 5', 'encoder 5 push'], ['encoder 6', 'encoder 6 push'], ['exit setup button']] }
]
const SHOWN = { 'layer button': 'LAYER', 'exit setup button': 'EXIT SETUP' }
const shownName = (name) => SHOWN[name] || name.replace('matrix ', '').replace('encoder', 'enc').replace('pot switch', 'sw').replace('fader', 'fader')

// The one open controller window of this page: a second press brings it forward.
let deviceWindow = null
export const WINDOW_FEATURES = 'popup=yes,width=440,height=1000'
export const BLOCKED_NOTE = 'The browser blocked the controller window. Allow pop-ups for this page, then press Device again.'

export default function K2LayoutPanel({ map, monitor, onClose, fxEffect = 0, console: current = K2_CONSOLES[0], consoles = K2_CONSOLES, onPickConsole, windowPath = '', publisher = null, openWindow = (...args) => window.open(...args) }) {
    const [blocked, setBlocked] = useState(false)
    const face = faceOfConsole(current)
    const openDevice = () => {
        publisher?.ensure()
        try { if (deviceWindow && !deviceWindow.closed) { deviceWindow.focus?.(); setBlocked(false); return } } catch { deviceWindow = null }
        const opened = openWindow(windowPath, K2_WINDOW_NAME, WINDOW_FEATURES)
        deviceWindow = opened || null
        setBlocked(!opened)
        try { opened?.focus?.() } catch { /* a window that cannot be focused is still open */ }
    }
    const snap = useSyncExternalStore(monitor.subscribe, monitor.getSnapshot)
    const [selected, setSelected] = useState('')
    const [faded, setFaded] = useState(null) // the snapshot whose lights have run out

    // a touched control stays lit for TOUCH_MS; one re-render after that turns it off
    useEffect(() => {
        const timer = setTimeout(() => setFaded(snap), TOUCH_MS + 30)
        return () => clearTimeout(timer)
    }, [snap])

    // Escape closes the panel (and is not also read as "deselect the clip")
    useEffect(() => {
        const onKey = (event) => {
            if (event.key !== 'Escape') return
            event.stopPropagation()
            event.preventDefault()
            onClose?.()
        }
        window.addEventListener('keydown', onKey, true)
        return () => window.removeEventListener('keydown', onKey, true)
    }, [onClose])

    const chosen = selected ? byName.get(selected) : null
    const detail = chosen
        ? lineOf(chosen, map, current, fxEffect)
        : 'Click a control to see its message and what it does'

    const control = (name) => {
        const item = byName.get(name)
        if (!item) return null
        const key = controlKey(item.kind, item.number)
        const label = jobOf(item, map, current, fxEffect)
        const unused = label === 'not used'
        const held = Boolean(snap.held[key])
        const lit = faded !== snap && (held || snap.at - (snap.touched[key] ?? -Infinity) < TOUCH_MS)
        const analog = item.type === 'pot' || item.type === 'fader'
        const value = snap.values[key]
        const fill = analog && Number.isFinite(value) ? Math.round((value / 127) * 100) : null
        return (
            <button
                key={name}
                type="button"
                className={`k2-control k2-control--${item.type}${lit ? ' is-lit' : ''}${held ? ' is-held' : ''}${selected === name ? ' is-selected' : ''}${label === 'free' || unused ? ' is-free' : ''}`}
                data-k2={name}
                aria-label={`${name}: ${label}`}
                aria-pressed={selected === name}
                style={fill === null ? undefined : { '--k2-fill': `${fill}%` }}
                onClick={() => setSelected(selected === name ? '' : name)}
            >
                <span className="k2-control-name">{shownName(name)}</span>
                <span className="k2-control-what">{label}</span>
                {lit && Number.isFinite(value) && item.mode !== 'relative' && item.kind === 'cc' ? <span className="k2-control-value" data-k2-value>{value}</span> : null}
            </button>
        )
    }

    return (
        <section className="k2-panel" aria-label="Xone:K2 layout">
            <header className="k2-panel-head">
                <span className="k2-panel-title">{current.name}</span>
                <span className="k2-switch" role="group" aria-label="K2 console">
                    {consoles.map((item) => (
                        <button key={item.id} type="button" className={`k2-switch-item${item.id === current.id ? ' is-on' : ''}`} aria-pressed={item.id === current.id} onClick={() => onPickConsole?.(item.id)}>{item.name}</button>
                    ))}
                </span>
                {face && windowPath ? <button type="button" className="k2-device" title="Open the controller as a picture in its own window" onClick={openDevice}>Device</button> : null}
                <button type="button" className="k2-close" onClick={onClose} aria-label="Close the K2 layout">Close</button>
            </header>
            <div className="k2-body">
                {ROWS.map((row) => (
                    <div key={row.id} className="k2-row" role="group" aria-label={row.title}>
                        {row.cells.map((names) => (
                            <div key={names.join('|')} className="k2-cell">{names.map(control)}</div>
                        ))}
                    </div>
                ))}
            </div>
            {blocked ? <p className="k2-detail" role="alert">{BLOCKED_NOTE}</p> : null}
            <p className="k2-detail" role="status" aria-live="polite">{detail}</p>
        </section>
    )
}
