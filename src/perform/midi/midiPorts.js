import { useCallback, useEffect, useRef, useState } from 'react'
import { MIDI_STATUS, parseMidiMessage } from '../../raw/utils/midiCapture.js'
import { pickInputId } from './xoneK2.js'

// One Web MIDI access for the deck: the input to listen on (the K2 by name, else
// the first) and the outputs, behind ONE `active` switch. While `active` is false
// requestMIDIAccess is never called (a read-only view, or a second view of a deck
// another view already drives, must not open MIDI at all).
//
// Same navigator boundary and status vocabulary as raw/utils/midiCapture.js
// (useMidiInput / useMidiOutput), which cannot be switched off.
const portsOf = (map) => (!map ? [] : typeof map.values === 'function' ? Array.from(map.values()) : Array.from(map))
const describe = (port) => ({ id: port.id, name: port.name || port.id, manufacturer: port.manufacturer || '', state: port.state || 'connected' })
const connected = (port) => port.state !== 'disconnected'

export function useMidiPorts({ active, onMessage }) {
    const [ports, setPorts] = useState({ status: MIDI_STATUS.REQUESTING, inputs: [], outputs: [], generation: 0 })
    const onMessageRef = useRef(onMessage)
    useEffect(() => { onMessageRef.current = onMessage })
    const accessRef = useRef(null)
    const handleRaw = useCallback((event) => {
        const message = parseMidiMessage(event?.data)
        if (message) onMessageRef.current?.(message)
    }, [])

    useEffect(() => {
        if (!active) return undefined
        if (typeof navigator === 'undefined' || typeof navigator.requestMIDIAccess !== 'function') {
            setPorts((current) => ({ ...current, status: MIDI_STATUS.UNSUPPORTED }))
            return undefined
        }
        let cancelled = false
        const bound = new Set()
        let signature = ''
        const attach = (access) => {
            if (cancelled) return
            const inputs = portsOf(access.inputs).filter(connected)
            const outputs = portsOf(access.outputs).filter(connected)
            const pick = pickInputId(inputs.map(describe))
            for (const input of portsOf(access.inputs)) {
                const isTarget = connected(input) && input.id === pick
                input.onmidimessage = isTarget ? handleRaw : null
                if (isTarget) bound.add(input)
            }
            // a new generation whenever the set of outputs (or a state) changed, so the
            // caller resends every LED to a device that went away and came back
            const next = outputs.map((output) => `${output.id}:${output.state || 'connected'}`).join('|')
            const changed = next !== signature
            signature = next
            setPorts((current) => ({
                status: inputs.length ? MIDI_STATUS.ACTIVE : MIDI_STATUS.NO_DEVICES,
                inputs: inputs.map(describe),
                outputs: outputs.map(describe),
                generation: current.generation + (changed ? 1 : 0)
            }))
        }
        setPorts((current) => ({ ...current, status: MIDI_STATUS.REQUESTING }))
        navigator.requestMIDIAccess({ sysex: false })
            .then((access) => {
                if (cancelled) return
                accessRef.current = access
                attach(access)
                access.onstatechange = () => attach(access)
            })
            .catch((error) => {
                if (cancelled) return
                const denied = error?.name === 'SecurityError' || error?.name === 'NotAllowedError'
                setPorts((current) => ({ ...current, status: denied ? MIDI_STATUS.DENIED : MIDI_STATUS.ERROR }))
            })
        return () => {
            cancelled = true
            for (const input of bound) input.onmidimessage = null
            if (accessRef.current) accessRef.current.onstatechange = null
            accessRef.current = null
            setPorts({ status: MIDI_STATUS.REQUESTING, inputs: [], outputs: [], generation: 0 })
        }
    }, [active, handleRaw])

    /** Write bytes to one output; true when they left. A vanished port is a hotplug fact, not a crash. */
    const send = useCallback((outputId, data) => {
        const output = portsOf(accessRef.current?.outputs).find((item) => item.id === outputId)
        if (!output || !connected(output)) return false
        try { output.send(data); return true } catch { return false }
    }, [])

    return { ...ports, send }
}
