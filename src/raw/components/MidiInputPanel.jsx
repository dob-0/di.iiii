import { useCallback, useEffect, useRef, useState } from 'react'
import { MIDI_STATUS, portStatusForMidiStatus, useMidiInput } from '../utils/midiCapture.js'
import { PORT_STATUS } from '../../project/graph/livePorts.js'

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

export default function MidiInputPanel({ node, values, onSignalChange, onStatusChange, onConfigChange }) {
    const deviceId = values?.deviceId ?? node.values?.deviceId ?? ''
    const channel = Number(values?.channel ?? node.values?.channel ?? 0)

    const [last, setLast] = useState(null)
    // The trigger port is declared `signal`. The runtime never computes signal
    // outputs, so this follows the one idiom that works here (see time.beat): a
    // monotonically rising count, where a consumer detects an event by the
    // number changing rather than by catching a pulse between frames.
    const triggerRef = useRef(0)

    const handleMessage = useCallback((message) => {
        triggerRef.current += 1
        setLast(message)
        if (message.kind === 'cc') {
            onSignalChange?.(node.id, { cc: message.cc, value: message.value, trigger: triggerRef.current })
        } else {
            onSignalChange?.(node.id, {
                note: message.note,
                // A note-off reports velocity 0 rather than clearing the port:
                // downstream reads a number that fell to zero, which is what a
                // released key means.
                velocity: message.velocity,
                trigger: triggerRef.current
            })
        }
    }, [node.id, onSignalChange])

    const { status, devices, errorMessage } = useMidiInput({ deviceId, channel, onMessage: handleMessage })

    useEffect(() => () => onSignalChange?.(node.id, null), [node.id, onSignalChange])

    // Tell the graph why the ports are empty. Safari and Firefox have no Web
    // MIDI at all, which is the single most common reason this node produces
    // nothing — and until now the only place that fact appeared was inside
    // this window.
    useEffect(() => {
        onStatusChange?.(node.id, portStatusForMidiStatus(status), errorMessage || null)
        // Back to IDLE on unmount, for the same reason the value ports clear:
        // this window closing is not evidence that the browser still has no
        // MIDI. A status that outlives the thing reporting it is a lie with a
        // long shelf life.
        return () => onStatusChange?.(node.id, PORT_STATUS.IDLE, null)
    }, [node.id, status, errorMessage, onStatusChange])

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
