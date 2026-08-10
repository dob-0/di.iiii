import { PORT_STATUS } from '../../project/graph/livePorts.js'
import { useCallback, useEffect, useRef, useState } from 'react'

// Web MIDI, as the first capability that will eventually have TWO providers:
// the browser today, and the local bridge later (see
// docs/architecture/RAW_WORKSPACE.md §5.4). It is the cheapest proof of that
// contract because it is the one device family a page can already reach.
//
// Same status vocabulary shape as mediaCaptureStatus.js: for this node family,
// "you said no" and "nothing is plugged in" are ordinary outcomes that need a
// visible surface, not error states to swallow.
export const MIDI_STATUS = {
    REQUESTING: 'requesting',
    ACTIVE: 'active',
    DENIED: 'denied',
    UNSUPPORTED: 'unsupported',
    NO_DEVICES: 'no-devices',
    ERROR: 'error'
}

// Onto the graph's port vocabulary, so a `note` port that is empty can say
// which kind of empty it is. UNSUPPORTED and NO_DEVICES both land on
// UNAVAILABLE — from the graph's side they are the same fact ("not here, and
// retrying will not change it"); the difference is a sentence for the panel,
// which keeps its own richer message.
export const portStatusForMidiStatus = (midiStatus) => {
    switch (midiStatus) {
        case MIDI_STATUS.REQUESTING: return PORT_STATUS.STARTING
        case MIDI_STATUS.ACTIVE: return PORT_STATUS.LIVE
        case MIDI_STATUS.DENIED: return PORT_STATUS.DENIED
        case MIDI_STATUS.UNSUPPORTED:
        case MIDI_STATUS.NO_DEVICES: return PORT_STATUS.UNAVAILABLE
        case MIDI_STATUS.ERROR: return PORT_STATUS.ERROR
        default: return PORT_STATUS.IDLE
    }
}

// Every port on this node shares one device's fate, so the device's status is
// reported on all of them rather than only the one that last carried a value.
export const MIDI_SIGNAL_PORTS = Object.freeze(['note', 'velocity', 'cc', 'value', 'trigger'])

const NOTE_OFF = 0x8
const NOTE_ON = 0x9
const CONTROL_CHANGE = 0xb

/**
 * Decode one MIDI message into the ports this node declares.
 * Returns null for messages the node has no port for, so callers can ignore
 * clock/aftertouch/pitch-bend traffic without a special case each.
 *
 * @param {number[]|Uint8Array} data raw MIDI bytes
 * @returns {{kind:string, channel:number, note?:number, velocity?:number, cc?:number, value?:number}|null}
 */
export const parseMidiMessage = (data) => {
    if (!data || data.length < 2) return null
    const status = data[0]
    // System messages (0xF0-0xFF) carry no channel nibble at all — clock and
    // active-sensing arrive constantly and must not be read as channel 15.
    if (status >= 0xf0) return null
    const command = status >> 4
    const channel = (status & 0x0f) + 1
    const d1 = data[1]
    const d2 = data.length > 2 ? data[2] : 0

    if (command === NOTE_ON) {
        // A note-on with zero velocity IS a note-off — most keyboards send this
        // rather than 0x8, so treating it as a press leaves notes stuck on.
        return d2 > 0
            ? { kind: 'noteOn', channel, note: d1, velocity: d2 }
            : { kind: 'noteOff', channel, note: d1, velocity: 0 }
    }
    if (command === NOTE_OFF) return { kind: 'noteOff', channel, note: d1, velocity: 0 }
    if (command === CONTROL_CHANGE) return { kind: 'cc', channel, cc: d1, value: d2 }
    return null
}

/**
 * Should this node act on this message? `channel` 0 means every channel.
 */
export const matchesChannel = (message, channel) => {
    if (!message) return false
    const wanted = Number(channel) || 0
    return wanted === 0 || message.channel === wanted
}

const listInputs = (access) => {
    if (!access?.inputs) return []
    // MIDIInputMap is a Map-like; older shapes expose .values() only.
    const inputs = typeof access.inputs.values === 'function'
        ? Array.from(access.inputs.values())
        : Array.from(access.inputs)
    return inputs.map((input) => ({
        id: input.id,
        name: input.name || input.id,
        manufacturer: input.manufacturer || ''
    }))
}

/**
 * Subscribe to one MIDI input.
 *
 * @param {object} options
 * @param {string} options.deviceId  '' means "the first one that appears"
 * @param {number} options.channel   0 for every channel
 * @param {(message:object)=>void} options.onMessage
 */
export function useMidiInput({ deviceId = '', channel = 0, onMessage } = {}) {
    const [status, setStatus] = useState(MIDI_STATUS.REQUESTING)
    const [devices, setDevices] = useState([])
    const [errorMessage, setErrorMessage] = useState('')
    const accessRef = useRef(null)
    // Same trap the keeper panel hit: a caller's inline arrow changes identity
    // every render, and putting it in an effect dependency list would tear the
    // subscription down constantly. See docs/ai/known-fixes.md.
    const onMessageRef = useRef(onMessage)
    useEffect(() => { onMessageRef.current = onMessage })

    const channelRef = useRef(channel)
    useEffect(() => { channelRef.current = channel })
    const deviceIdRef = useRef(deviceId)
    useEffect(() => { deviceIdRef.current = deviceId })

    const handleRaw = useCallback((event) => {
        const message = parseMidiMessage(event?.data)
        if (!message) return
        if (!matchesChannel(message, channelRef.current)) return
        onMessageRef.current?.(message)
    }, [])

    useEffect(() => {
        let cancelled = false
        const attached = new Set()

        const attach = (access) => {
            if (cancelled) return
            const available = listInputs(access)
            setDevices(available)
            setStatus(available.length ? MIDI_STATUS.ACTIVE : MIDI_STATUS.NO_DEVICES)

            const inputs = typeof access.inputs.values === 'function'
                ? Array.from(access.inputs.values())
                : Array.from(access.inputs)
            for (const input of inputs) {
                const wanted = deviceIdRef.current
                const isTarget = wanted ? input.id === wanted : true
                input.onmidimessage = isTarget ? handleRaw : null
                if (isTarget) attached.add(input)
            }
        }

        if (typeof navigator === 'undefined' || typeof navigator.requestMIDIAccess !== 'function') {
            setStatus(MIDI_STATUS.UNSUPPORTED)
            return undefined
        }

        setStatus(MIDI_STATUS.REQUESTING)
        // sysex is deliberately NOT requested: it needs a stronger permission
        // and none of this node's ports carry sysex.
        navigator.requestMIDIAccess({ sysex: false })
            .then((access) => {
                if (cancelled) return
                accessRef.current = access
                attach(access)
                // Hotplug is the normal case at a venue — a controller is
                // plugged in after the page is already open.
                access.onstatechange = () => attach(access)
            })
            .catch((error) => {
                if (cancelled) return
                const denied = error?.name === 'SecurityError' || error?.name === 'NotAllowedError'
                setStatus(denied ? MIDI_STATUS.DENIED : MIDI_STATUS.ERROR)
                setErrorMessage(error?.message || '')
            })

        return () => {
            cancelled = true
            for (const input of attached) input.onmidimessage = null
            if (accessRef.current) accessRef.current.onstatechange = null
        }
    }, [handleRaw, deviceId])

    return { status, devices, errorMessage }
}
