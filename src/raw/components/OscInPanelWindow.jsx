import { useEffect, useMemo, useRef, useState } from 'react'
import {
    BRIDGE_STATUS,
    bridgeStatusText,
    describeArgs,
    firstValue,
    oscApiBase,
    readOscIn,
} from '../utils/oscBridgeClient.js'

// 50 ms: twenty reads a second on this machine's own loopback. A message is
// readable at the bridge ~1.3 ms after it is sent (p50, measured by
// scripts/osc/osc-loopback-rehearsal.mjs), so this poll is the latency.
export const OSC_IN_POLL_MS = 50

// Module-level, not an inline default: a fresh arrow per render in the poll
// effect's dependencies would restart the poll on every render (the keeper's
// inline-arrow lesson, the DMX Out panel's comment).
const defaultFetch = (...args) => fetch(...args)

const portOf = (value) => {
    const n = Math.round(Number(value))
    return Number.isInteger(n) && n >= 1024 && n <= 65535 ? n : null
}

// The graph's ear on the network: OSC 1.0 from TouchDesigner, Resolume, QLab,
// VCV Cardinal or a console, heard by this machine's di.iiii (a page cannot
// open a UDP socket) and read here every 50 ms. Address and Value are the
// latest matching message; Signal is a rising count of them (the MIDI In
// idiom) — messages already waiting when the panel opens are shown, never
// counted, so opening a project does not fire its cues.
export default function OscInPanelWindow({
    node,
    values,
    onSignalChange,
    onConfigChange,
    fetchImpl = defaultFetch,
    pageOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
    pollMs = OSC_IN_POLL_MS,
}) {
    const port = portOf(values?.port ?? node.values?.port ?? 8000)
    const pattern = String(values?.pattern ?? node.values?.pattern ?? '').trim()
    const base = useMemo(() => oscApiBase(pageOrigin), [pageOrigin])

    const [state, setState] = useState({ status: BRIDGE_STATUS.CHECKING, error: '', bind: '', last: null, count: 0, missed: 0 })

    const fetchRef = useRef(fetchImpl)
    useEffect(() => { fetchRef.current = fetchImpl })
    const reportRef = useRef(onSignalChange)
    useEffect(() => { reportRef.current = onSignalChange })

    useEffect(() => {
        if (port === null) {
            setState({ status: BRIDGE_STATUS.REFUSED, error: 'Listen Port is a whole number from 1024 to 65535', bind: '', last: null, count: 0, missed: 0 })
            return undefined
        }
        let alive = true
        let timer = null
        let since = null // null until the first read sets the baseline
        let count = 0
        let missed = 0
        let last = null
        let shown = BRIDGE_STATUS.CHECKING
        const controller = typeof AbortController === 'function' ? new AbortController() : null
        setState({ status: BRIDGE_STATUS.CHECKING, error: '', bind: '', last: null, count: 0, missed: 0 })
        const look = async () => {
            const result = await readOscIn(base, { port, pattern, since: since ?? 0 }, { fetchImpl: fetchRef.current, signal: controller?.signal })
            if (!alive) return
            if (result.status === BRIDGE_STATUS.ANSWERING) {
                const fresh = result.messages
                if (fresh.length) last = fresh[fresh.length - 1]
                // The first read is the baseline: what was already there is shown, not counted.
                if (since !== null) { count += fresh.length; missed += result.missed }
                const first = since === null
                since = Math.max(since ?? 0, result.seq)
                // Twenty reads a second must not mean twenty renders a second: only a
                // message or a change of state re-renders.
                if (first || fresh.length || shown !== result.status) {
                    setState({ status: result.status, error: '', bind: result.bind, last, count, missed })
                }
            } else if (shown !== `${result.status}|${result.error || ''}`) {
                setState((was) => ({ ...was, status: result.status, error: result.error || '' }))
            }
            shown = result.status === BRIDGE_STATUS.ANSWERING ? result.status : `${result.status}|${result.error || ''}`
            if (alive) timer = setTimeout(look, pollMs)
        }
        look()
        return () => {
            alive = false
            clearTimeout(timer)
            controller?.abort()
        }
    }, [base, port, pattern, pollMs])

    const statusText = useMemo(() => {
        const s = state.status
        if (s === BRIDGE_STATUS.CHECKING) return `Opening port ${port}…`
        if (s === BRIDGE_STATUS.REFUSED) return state.error
        if (s !== BRIDGE_STATUS.ANSWERING) return bridgeStatusText(s)
        const where = state.bind === '0.0.0.0' ? `port ${port} on this network` : `port ${port} on this machine only`
        if (!state.last) return `Listening on ${where}${pattern ? ` for ${pattern}` : ''} — nothing heard yet`
        const lost = state.missed ? ` · ${state.missed} missed` : ''
        return `${state.last.address} ${describeArgs(state.last)} · ${state.count} heard${lost}`
    }, [state, port, pattern])

    const address = state.last?.address ?? ''
    const value = state.last ? firstValue(state.last) : 0
    useEffect(() => {
        reportRef.current?.(node.id, { address, value, signal: state.count, status: statusText })
    }, [node.id, address, value, state.count, statusText])
    useEffect(() => () => { reportRef.current?.(node.id, null) }, [node.id])

    return (
        <div className="raw-dmx-panel">
            <label className="raw-dmx-panel-field">
                <span className="raw-dmx-panel-label">Port</span>
                <input
                    className="raw-dmx-panel-input"
                    type="number"
                    min="1024"
                    max="65535"
                    value={values?.port ?? node.values?.port ?? ''}
                    onChange={(event) => onConfigChange?.(node.id, { port: Number(event.target.value) })}
                />
            </label>
            <label className="raw-dmx-panel-field">
                <span className="raw-dmx-panel-label">Filter</span>
                <input
                    className="raw-dmx-panel-input"
                    type="text"
                    value={values?.pattern ?? node.values?.pattern ?? ''}
                    placeholder="every address, or /fader/*"
                    onChange={(event) => onConfigChange?.(node.id, { pattern: event.target.value })}
                />
            </label>
            <div className="raw-dmx-panel-status" role="status">{statusText}</div>
            {state.status === BRIDGE_STATUS.ANSWERING && state.bind === '127.0.0.1' && (
                <div className="raw-dmx-panel-setup">
                    Another machine&rsquo;s OSC reaches this port only when di.iiii was started with di up --lan.
                </div>
            )}
        </div>
    )
}
