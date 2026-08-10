import { useEffect, useRef, useState } from 'react'
import { DIJET_DEFAULT_HOST, DIJET_STATUS, useDijetLink } from '../utils/dijetCapture.js'

// The robot's 14-lamp strip and its buzzer.
//
// Every lamp write goes down the SAME serial port as the motor commands, so
// this node is rate-limited on purpose. A graph wired to an audio level would
// otherwise happily emit 60 writes a second and fight /cmd_vel for the bus.
// Motion on the strip belongs to the board's own effects, which cost one write
// no matter how long they run.

const STATUS_MESSAGE = {
    [DIJET_STATUS.IDLE]: 'Give it the robot’s address to start.',
    [DIJET_STATUS.CONNECTING]: 'Reaching the robot…',
    [DIJET_STATUS.UNREACHABLE]: 'No answer. This page has to be on the same network as the robot.'
}

const MIN_INTERVAL_MS = 500
const EFFECTS = ['off', 'chase', 'marquee', 'breathe', 'gradient', 'twinkle', 'battery']

export const hexToRgb = (hex) => {
    const s = String(hex || '').trim().replace(/^#/, '')
    if (!/^[0-9a-fA-F]{6}$/.test(s)) return null
    return [
        parseInt(s.slice(0, 2), 16),
        parseInt(s.slice(2, 4), 16),
        parseInt(s.slice(4, 6), 16)
    ]
}

export default function DijetLightsPanel({ node, values, inputs, onConfigChange }) {
    const host = values?.host ?? node.values?.host ?? DIJET_DEFAULT_HOST
    const { status, linkRef } = useDijetLink(host)
    const [draft, setDraft] = useState(host)
    useEffect(() => { setDraft(host) }, [host])
    const [lastSent, setLastSent] = useState(null)

    const color = inputs?.color ?? node.values?.color ?? '#3fb950'
    const effect = Math.round(Number(inputs?.effect ?? 0)) || 0
    const beepMs = Math.round(Number(inputs?.beep ?? 0)) || 0

    const sentRef = useRef({ payload: '', at: 0, beep: 0 })

    useEffect(() => {
        const link = linkRef.current
        if (!link || status !== DIJET_STATUS.ACTIVE) return
        let payload = null
        let label = null
        if (effect > 0 && effect < EFFECTS.length) {
            // The driver's speed is 1..10 and SMALLER IS FASTER, so a graph
            // sending "speed" would mean the opposite of what it says. Fixed at
            // a middle value rather than exposing an inverted number.
            payload = { effect, speed: 6, parm: 1 }
            label = EFFECTS[effect]
        } else {
            const rgb = hexToRgb(color)
            if (rgb) { payload = { all: rgb }; label = color }
        }
        if (!payload) return
        const serialised = JSON.stringify(payload)
        const now = Date.now()
        if (serialised === sentRef.current.payload) return
        if (now - sentRef.current.at < MIN_INTERVAL_MS) return
        sentRef.current = { ...sentRef.current, payload: serialised, at: now }
        link.advertise('/dijet/leds', 'std_msgs/String')
        link.publish('/dijet/leds', { data: serialised })
        setLastSent(label)
    }, [color, effect, status, linkRef])

    useEffect(() => {
        const link = linkRef.current
        if (!link || status !== DIJET_STATUS.ACTIVE) return
        if (beepMs <= 0 || beepMs === sentRef.current.beep) return
        sentRef.current = { ...sentRef.current, beep: beepMs }
        link.advertise('/dijet/beep', 'std_msgs/Int32')
        link.publish('/dijet/beep', { data: Math.min(beepMs, 30000) })
    }, [beepMs, status, linkRef])

    const commitHost = () => {
        const next = draft.trim()
        if (next !== host) onConfigChange?.(node.id, { host: next })
    }

    const showStatus = status !== DIJET_STATUS.ACTIVE

    return (
        <div className="raw-dijet-panel">
            {showStatus && (
                <div className="raw-dijet-panel-status" role="status">
                    {STATUS_MESSAGE[status]}
                </div>
            )}

            <label className="raw-dijet-panel-field">
                <span className="raw-dijet-panel-label">Robot</span>
                <input
                    className="raw-dijet-panel-input"
                    value={draft}
                    spellCheck={false}
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={commitHost}
                    onKeyDown={(event) => { if (event.key === 'Enter') commitHost() }}
                />
            </label>

            {/* One row, not two: an effect used to be named in both "Showing"
                and "Effect", which read as two facts when it is one. */}
            <dl className="raw-dijet-panel-readout">
                <dt>Showing</dt>
                <dd>{lastSent || '—'}</dd>
            </dl>

            <div className="raw-dijet-panel-note">
                One write per change, at most twice a second — the lamps share a
                serial port with the motors.
            </div>
        </div>
    )
}
