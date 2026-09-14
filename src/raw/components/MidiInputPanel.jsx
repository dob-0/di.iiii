import { useCallback, useEffect, useRef } from 'react'
import { MIDI_STATUS, useMidiInput } from '../utils/midiCapture.js'
import { clearFeedReport, reportFeed, useFeedReport } from '../utils/feedReports.js'

const STATUS_MESSAGE = {
    [MIDI_STATUS.REQUESTING]: 'Asking for MIDI access…',
    [MIDI_STATUS.DENIED]: 'MIDI access denied. Allow it in your browser’s site settings to use this node.',
    [MIDI_STATUS.UNSUPPORTED]: 'This browser has no Web MIDI. Chrome and Edge have it; Safari and Firefox do not.',
    [MIDI_STATUS.NO_DEVICES]: 'No MIDI devices. Plug a controller in — it will appear here without reloading.',
    [MIDI_STATUS.ERROR]: 'Could not reach MIDI.'
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
// Middle C = note 60 = C4 in the convention most controllers print on the case.
export const noteName = (note) => `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`

// The MIDI port, listened to for as long as the MIDI In NODE exists — the
// window can close and Note, CC and Trigger keep driving the graph. One
// listener per node, here only.
export function MidiInputFeed({ node, values, onSignalChange }) {
    const deviceId = values?.deviceId ?? node.values?.deviceId ?? ''
    const channel = Number(values?.channel ?? node.values?.channel ?? 0)

    // The trigger port is declared `signal`: a monotonically rising count, where
    // a consumer detects an event by the number changing rather than by
    // catching a pulse between frames (see wireCoercion.js).
    const triggerRef = useRef(0)
    const onSignalChangeRef = useRef(onSignalChange)
    useEffect(() => { onSignalChangeRef.current = onSignalChange })

    const handleMessage = useCallback((message) => {
        triggerRef.current += 1
        reportFeed(node.id, { last: message })
        if (message.kind === 'cc') {
            onSignalChangeRef.current?.(node.id, { cc: message.cc, value: message.value, trigger: triggerRef.current })
        } else {
            onSignalChangeRef.current?.(node.id, {
                note: message.note,
                // A note-off reports velocity 0 rather than clearing the port:
                // downstream reads a number that fell to zero, which is what a
                // released key means.
                velocity: message.velocity,
                trigger: triggerRef.current
            })
        }
    }, [node.id])

    const { status, devices, errorMessage } = useMidiInput({ deviceId, channel, onMessage: handleMessage })

    useEffect(() => { reportFeed(node.id, { status, devices, errorMessage }) }, [node.id, status, devices, errorMessage])
    useEffect(() => () => {
        onSignalChangeRef.current?.(node.id, null)
        clearFeedReport(node.id)
    }, [node.id])

    return null
}

// The MIDI In window: device and channel pickers over the feed's report.
export default function MidiInputPanel({ node, values, onConfigChange }) {
    const deviceId = values?.deviceId ?? node.values?.deviceId ?? ''
    const channel = Number(values?.channel ?? node.values?.channel ?? 0)
    const { status = MIDI_STATUS.REQUESTING, devices = [], errorMessage = '', last = null } = useFeedReport(node.id)

    const showStatus = status !== MIDI_STATUS.ACTIVE

    return (
        <div className="raw-midi-panel">
            {showStatus && (
                <div className="raw-midi-panel-status" role="status">
                    {STATUS_MESSAGE[status] || errorMessage}
                </div>
            )}

            {devices.length > 0 && (
                <label className="raw-midi-panel-field">
                    <span className="raw-midi-panel-label">Device</span>
                    <select
                        className="raw-midi-panel-select"
                        value={deviceId}
                        onChange={(event) => onConfigChange?.(node.id, { deviceId: event.target.value })}
                    >
                        <option value="">First available</option>
                        {devices.map((device) => (
                            <option key={device.id} value={device.id}>{device.name}</option>
                        ))}
                    </select>
                </label>
            )}

            <label className="raw-midi-panel-field">
                <span className="raw-midi-panel-label">Channel</span>
                <select
                    className="raw-midi-panel-select"
                    value={String(channel)}
                    onChange={(event) => onConfigChange?.(node.id, { channel: Number(event.target.value) })}
                >
                    <option value="0">All channels</option>
                    {Array.from({ length: 16 }, (_, i) => (
                        <option key={i + 1} value={String(i + 1)}>{i + 1}</option>
                    ))}
                </select>
            </label>

            <div className="raw-midi-panel-last">
                {last
                    ? (last.kind === 'cc'
                        ? `CC ${last.cc} = ${last.value}  ·  ch ${last.channel}`
                        : `${last.kind === 'noteOn' ? 'Note on' : 'Note off'} ${noteName(last.note)} (${last.note})  ·  vel ${last.velocity}  ·  ch ${last.channel}`)
                    : 'Nothing received yet.'}
            </div>
        </div>
    )
}
