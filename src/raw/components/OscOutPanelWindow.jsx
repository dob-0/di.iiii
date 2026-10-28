import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createThrottledSender } from '../utils/dmxRigClient.js'
import {
    BRIDGE_STATUS,
    bridgeStatusText,
    oscApiBase,
    oscArgsOf,
    readBridgeState,
    sendOsc,
} from '../utils/oscBridgeClient.js'

// Value changes coalesce to one message per 20 ms (50 a second), the LATEST
// value winning: an oscillator ticks at the frame rate, and the receiver wants
// the newest number, not a queue of old ones.
export const OSC_OUT_THROTTLE_MS = 20
const BRIDGE_POLL_MS = 5000

const defaultFetch = (...args) => fetch(...args)

// The graph's voice on the network: one OSC 1.0 message per change, sent by
// this machine's di.iiii (a page cannot send UDP). The MIDI Out contract worn
// by OSC: a message goes out when Value CHANGES, nothing is sent for a value
// that merely keeps being itself, and Trigger re-sends — on its rising edge,
// and whenever it changes while held (a rising count). A Trigger with nothing
// on Value sends the bare address, which is a whole command to QLab ("/go").
export default function OscOutPanelWindow({
    node,
    values,
    onStatus,
    onConfigChange,
    fetchImpl = defaultFetch,
    pageOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
}) {
    const host = String(values?.targetHost ?? node.values?.targetHost ?? '').trim()
    const port = Math.round(Number(values?.targetPort ?? node.values?.targetPort))
    const numbers = (values?.numbers ?? node.values?.numbers) === 'int' ? 'int' : 'float'
    const address = String(values?.address ?? '/control').trim()
    const base = useMemo(() => oscApiBase(pageOrigin), [pageOrigin])

    const fetchRef = useRef(fetchImpl)
    useEffect(() => { fetchRef.current = fetchImpl })

    const [bridge, setBridge] = useState(BRIDGE_STATUS.CHECKING)
    const [last, setLast] = useState(null) // { ok, text }
    const [sent, setSent] = useState(0)

    // Is there a bridge at all? Asked on mount and every 5 s: a hosted page is
    // told at once, and a di.iiii started after the page is found again.
    useEffect(() => {
        let alive = true
        const controller = typeof AbortController === 'function' ? new AbortController() : null
        const look = async () => {
            const result = await readBridgeState(base, { fetchImpl: fetchRef.current, signal: controller?.signal })
            if (alive) setBridge(result.status)
        }
        look()
        const timer = setInterval(look, BRIDGE_POLL_MS)
        return () => { alive = false; clearInterval(timer); controller?.abort() }
    }, [base])

    // What one send needs, read at send time so a throttled send carries the
    // newest address and target, not the ones of the moment it was queued.
    // Synced in the first effect, so it is current before the send effects below.
    const target = useRef({ base, host, port, numbers, address })
    useEffect(() => { target.current = { base, host, port, numbers, address } })
    const sendNow = useCallback(async (value) => {
        const t = target.current
        const args = oscArgsOf(value)
        const result = await sendOsc(t.base, { host: t.host, port: t.port, address: t.address, args, numbers: t.numbers }, { fetchImpl: fetchRef.current })
        if (result.ok) {
            setSent((n) => n + 1)
            setLast({ ok: true, text: `${t.address}${args.length ? ` ${args.map((a) => (typeof a === 'number' ? Math.round(a * 1000) / 1000 : JSON.stringify(a))).join(' ')}` : ''} → ${result.to}` })
        } else {
            if (result.status !== BRIDGE_STATUS.REFUSED) setBridge(result.status)
            setLast({ ok: false, text: result.error || bridgeStatusText(result.status) })
        }
    }, [])
    // Made in an effect, declared before the effects that use it, so it exists
    // by the time Value first changes.
    const throttled = useRef(null)
    useEffect(() => {
        const sender = createThrottledSender(sendNow, OSC_OUT_THROTTLE_MS)
        throttled.current = sender
        return () => sender.cancel()
    }, [sendNow])

    const live = bridge === BRIDGE_STATUS.ANSWERING || bridge === BRIDGE_STATUS.CHECKING

    const value = values?.value
    const lastValue = useRef(value)
    useEffect(() => {
        const was = lastValue.current
        lastValue.current = value
        if (!live || value === undefined || value === null || Object.is(value, was)) return
        // A list arriving as a new array every frame with the same items is not a change.
        if (Array.isArray(value) && Array.isArray(was) && value.length === was.length && value.every((v, i) => Object.is(v, was[i]))) return
        throttled.current?.(value)
    }, [live, value])

    const trigger = values?.trigger
    const lastTrigger = useRef(trigger)
    useEffect(() => {
        const was = lastTrigger.current
        lastTrigger.current = trigger
        if (!live) return
        const on = Boolean(trigger)
        if ((on && !was) || (on && Boolean(was) && trigger !== was)) {
            throttled.current?.cancel()
            sendNow(values?.value)
        }
    }, [live, trigger, sendNow]) // eslint-disable-line react-hooks/exhaustive-deps -- Value is read at the edge, not a reason to send

    const statusText = useMemo(() => {
        if (bridge !== BRIDGE_STATUS.ANSWERING && bridge !== BRIDGE_STATUS.CHECKING) return bridgeStatusText(bridge)
        if (last && !last.ok) return last.text
        if (last) return `${last.text} · ${sent} sent`
        if (bridge === BRIDGE_STATUS.CHECKING) return 'Looking for this machine’s di.iiii…'
        return `Ready: sends to ${host || '(no host)'}:${Number.isFinite(port) ? port : '?'} when Value changes or Trigger fires`
    }, [bridge, last, sent, host, port])

    const onStatusRef = useRef(onStatus)
    useEffect(() => { onStatusRef.current = onStatus })
    useEffect(() => { onStatusRef.current?.(node.id, statusText) }, [node.id, statusText])
    useEffect(() => () => { onStatusRef.current?.(node.id, null) }, [node.id])

    return (
        <div className="raw-dmx-panel">
            <label className="raw-dmx-panel-field">
                <span className="raw-dmx-panel-label">Host</span>
                <input
                    className="raw-dmx-panel-input"
                    type="text"
                    value={values?.targetHost ?? node.values?.targetHost ?? ''}
                    placeholder="127.0.0.1 or 192.168.1.20"
                    onChange={(event) => onConfigChange?.(node.id, { targetHost: event.target.value })}
                />
            </label>
            <label className="raw-dmx-panel-field">
                <span className="raw-dmx-panel-label">Port</span>
                <input
                    className="raw-dmx-panel-input"
                    type="number"
                    min="1"
                    max="65535"
                    value={values?.targetPort ?? node.values?.targetPort ?? ''}
                    onChange={(event) => onConfigChange?.(node.id, { targetPort: Number(event.target.value) })}
                />
            </label>
            <label className="raw-dmx-panel-field">
                <span className="raw-dmx-panel-label">Numbers</span>
                <select
                    className="raw-dmx-panel-input"
                    value={numbers}
                    onChange={(event) => onConfigChange?.(node.id, { numbers: event.target.value })}
                >
                    <option value="float">Float (32-bit)</option>
                    <option value="int">Whole number (int32)</option>
                </select>
            </label>
            <div className="raw-dmx-panel-status" role="status">{statusText}</div>
        </div>
    )
}
