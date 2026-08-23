import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchLocalCapabilities, sendOsc } from '../../services/oscApi.js'
import { PORT_STATUS, PORT_STATUS_TEXT } from '../../project/graph/portStatus.js'

// Asked once per page, not once per node: ten OSC nodes on a canvas must not
// mean ten capability requests, and the answer cannot change while the page is
// open — a di.iiii does not become local halfway through a show.
let capabilityPromise = null
const askCapabilities = () => {
    if (!capabilityPromise) {
        capabilityPromise = fetchLocalCapabilities()
            .then((body) => Boolean(body?.capabilities?.osc))
            .catch(() => false)
    }
    return capabilityPromise
}

export const __resetCapabilities = () => { capabilityPromise = null }

const clampPort = (value) => {
    const port = Math.round(Number(value))
    return Number.isFinite(port) && port > 0 && port < 65536 ? port : null
}

// The graph's hand on an OSC cable — no window, one per OSC Out node, the
// MidiOutFeed shape.
//
// Two lanes, deliberately the same two MIDI Out has, because an author who has
// learned one should not have to learn the other:
//
// - Value: whenever it CHANGES, a message goes out. Nothing is sent for a value
//   that merely keeps being itself, or a re-render that changed nothing — at
//   60fps that is the difference between a control stream and a flood.
// - Trigger: a rising edge sends the current value. A trigger that stays truthy
//   but CHANGES re-fires, because "the number changed" is what a signal wire
//   means here (the time.beat idiom).
export default function OscOutFeed({ node, inputs, onStatus }) {
    const [available, setAvailable] = useState(null) // null = still asking
    // Status and its detail move together and are both RENDERED, so they are
    // state, not a ref. A ref would not re-render when only the detail changed
    // — the target moving from one desk to another would silently keep showing
    // the old one.
    const [{ status, detail }, setPort] = useState({ status: PORT_STATUS.STARTING, detail: '' })

    useEffect(() => {
        let alive = true
        askCapabilities().then((ok) => {
            if (!alive) return
            setAvailable(ok)
            setPort({ status: ok ? PORT_STATUS.IDLE : PORT_STATUS.UNAVAILABLE, detail: '' })
        })
        return () => { alive = false }
    }, [])

    const targetHost = String(node.values?.targetHost ?? '127.0.0.1')
    const targetPort = clampPort(node.values?.targetPort ?? 9000)
    const numberAs = node.values?.numberAs === 'int' ? 'int' : 'float'
    const address = inputs?.address ?? node.values?.address ?? '/control'
    const value = inputs?.value
    const trigger = inputs?.trigger

    // A bad port is the author's mistake and saying "Failed" for it would send
    // them looking at the network.
    const publish = useCallback((next, text = '') => {
        setPort({ status: next, detail: text })
    }, [])

    const fire = useCallback(async (payload) => {
        if (!available || targetPort === null) return
        try {
            await sendOsc({ host: targetHost, port: targetPort, address, args: [payload], numberAs })
            publish(PORT_STATUS.LIVE, `${address} → ${targetHost}:${targetPort}`)
        } catch (error) {
            // A refused send names itself: the person is on their own machine
            // and the answer is usually one flag or one wrong port away.
            publish(PORT_STATUS.ERROR, error?.message || 'could not send')
        }
    }, [available, targetHost, targetPort, address, numberAs, publish])

    const lastValue = useRef(value)
    useEffect(() => {
        const was = lastValue.current
        lastValue.current = value
        if (value === was || value === undefined || value === null) return
        fire(value)
    }, [value, fire])

    const lastTrigger = useRef(trigger)
    useEffect(() => {
        const was = lastTrigger.current
        lastTrigger.current = trigger
        const on = Boolean(trigger)
        const wasOn = Boolean(was)
        const restrike = on && wasOn && trigger !== was
        if ((on && !wasOn) || restrike) fire(value ?? 1)
    }, [trigger, value, fire])

    const statusText = targetPort === null
        ? `Target Port must be 1-65535 — got ${JSON.stringify(node.values?.targetPort)}`
        : (detail && status === PORT_STATUS.LIVE
            ? `Live · ${detail}`
            : (status === PORT_STATUS.ERROR && detail
                ? `Failed · ${detail}`
                : PORT_STATUS_TEXT[status] || ''))

    useEffect(() => {
        onStatus?.(node.id, statusText)
        return () => onStatus?.(node.id, null)
    }, [node.id, statusText, onStatus])

    return null
}
