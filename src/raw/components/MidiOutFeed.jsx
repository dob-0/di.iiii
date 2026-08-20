import { useEffect, useRef } from 'react'
import { MIDI_STATUS, useMidiOutput } from '../utils/midiCapture.js'

const STATUS_TEXT = {
    [MIDI_STATUS.REQUESTING]: 'Asking for MIDI access…',
    [MIDI_STATUS.DENIED]: 'MIDI access denied. Allow it in your browser’s site settings to use this node.',
    [MIDI_STATUS.UNSUPPORTED]: 'This browser has no Web MIDI. Chrome and Edge have it; Safari and Firefox do not.',
    [MIDI_STATUS.NO_DEVICES]: 'No MIDI devices. Plug something in — it will appear without reloading.',
    [MIDI_STATUS.ERROR]: 'Could not reach MIDI.'
}

const clamp7 = (value) => Math.min(127, Math.max(0, Math.round(Number(value) || 0)))
const clampChannel = (value) => Math.min(16, Math.max(1, Math.round(Number(value) || 1)))

// The graph's hand on a MIDI cable — no window, no mesh, one per MIDI Out
// node (the KeyboardFeed shape). Two independent lanes, the mirror of what
// MIDI In hears:
//
// - Notes: Trigger truthy holds the note. Rising edge sends note-on at
//   Note/Velocity, falling edge releases exactly the note it struck (Note
//   may have moved while held). A trigger that STAYS truthy but changes —
//   MIDI In's rising count, a Counter — re-strikes: that is what "the
//   number changed" means on a signal wire (the time.beat idiom).
// - Control: whenever Value changes, CC goes out at the current CC number.
//   Nothing is sent for a value that merely keeps being itself.
export default function MidiOutFeed({ node, inputs, onStatus }) {
    const { status, devices, send } = useMidiOutput({ deviceId: node.values?.deviceId ?? '' })

    const statusText = status === MIDI_STATUS.ACTIVE
        ? `Sending to ${devices.length} ${devices.length === 1 ? 'device' : 'devices'}`
        : (STATUS_TEXT[status] || '')
    useEffect(() => {
        onStatus?.(node.id, statusText)
        return () => onStatus?.(node.id, null)
    }, [node.id, statusText, onStatus])

    const channel = clampChannel(inputs?.channel)
    const trigger = inputs?.trigger
    const note = clamp7(inputs?.note ?? 60)
    const velocity = clamp7(inputs?.velocity ?? 100)
    const cc = clamp7(inputs?.cc ?? 1)
    const value = inputs?.value

    const held = useRef(null) // { note, channel } while a note is on
    const lastTrigger = useRef(trigger)
    useEffect(() => {
        const was = lastTrigger.current
        lastTrigger.current = trigger
        const on = Boolean(trigger)
        const wasOn = Boolean(was)
        const restrike = on && wasOn && trigger !== was
        if ((on && !wasOn) || restrike) {
            if (held.current) send([0x80 | (held.current.channel - 1), held.current.note, 0])
            if (send([0x90 | (channel - 1), note, Math.max(1, velocity)])) {
                held.current = { note, channel }
            }
        } else if (!on && wasOn && held.current) {
            send([0x80 | (held.current.channel - 1), held.current.note, 0])
            held.current = null
        }
    }, [trigger, note, velocity, channel, send])

    const lastValue = useRef(value)
    useEffect(() => {
        const was = lastValue.current
        lastValue.current = value
        if (value === was || value === undefined || value === null) return
        send([0xb0 | (channel - 1), cc, clamp7(value)])
    }, [value, cc, channel, send])

    // A note left sounding when the node goes away is a stuck key on a real
    // instrument — release it on the way out.
    useEffect(() => () => {
        if (held.current) send([0x80 | (held.current.channel - 1), held.current.note, 0])
    }, [send])

    return null
}
