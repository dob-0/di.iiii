import { useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import { getSocketConfigForRuntime } from '../../hooks/useSpaceSocket.js'
import { createNodeGraphContext, evaluateNodeInput } from '../graph/nodeGraphRuntime.js'

// Device egress: the side-effect layer that makes device.osc.out and
// device.midi.out real. The node graph runtime stays pure — this hook
// re-evaluates egress-node inputs after each document change, diffs against
// what was last sent, and ships only the changes:
//   OSC  → socket.io 'control-value' → serverXR oscOutput module → UDP
//   MIDI → Web MIDI API directly from the browser (Chrome/Edge; no-op elsewhere)
// The first pass after load primes the diff without sending, so opening a
// project doesn't jerk every mapped parameter in the target software.

const WATCHED_INPUTS = ['value', 'trigger']

const asMidiByte = (value) => {
    // Faders default to 0..1 (scaled to 0..127); values above 1 are treated
    // as raw MIDI numbers so a 0..127-range fader also works.
    const num = Number(value)
    if (!Number.isFinite(num)) return 0
    const scaled = num <= 1 ? num * 127 : num
    return Math.min(127, Math.max(0, Math.round(scaled)))
}

const asOscArg = (value) => {
    if (typeof value === 'boolean') return value ? 1 : 0
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0
    if (typeof value === 'string') return value
    const num = Number(value)
    return Number.isFinite(num) ? num : 0
}

const pickMidiOutput = (midiAccess, portName) => {
    const outputs = [...midiAccess.outputs.values()]
    if (!outputs.length) return null
    const wanted = String(portName || '').trim().toLowerCase()
    if (!wanted) return outputs[0]
    return outputs.find((port) => (port.name || '').toLowerCase().includes(wanted)) || outputs[0]
}

export function useDeviceEgress({ document, enabled = true }) {
    const socketRef = useRef(null)
    const midiAccessRef = useRef(null)
    const midiRequestedRef = useRef(false)
    const lastSentRef = useRef(new Map())
    const primedRef = useRef(false)

    useEffect(() => {
        if (!enabled || !document) return

        const nodes = document.nodes || []
        const oscNodes = nodes.filter((node) => node.typeId === 'device.osc.out')
        const midiNodes = nodes.filter((node) => node.typeId === 'device.midi.out')

        // Socket lifecycle: open while OSC egress nodes exist, closed otherwise.
        if (oscNodes.length && !socketRef.current) {
            const hasWindow = typeof window !== 'undefined'
            const { serverUrl, path, auth } = getSocketConfigForRuntime({
                configuredBase: import.meta.env.VITE_API_BASE_URL || '',
                token: '',
                isDev: Boolean(import.meta.env.DEV),
                locationOrigin: hasWindow ? window.location.origin : ''
            })
            socketRef.current = io(serverUrl, { path, auth, reconnection: true })
        } else if (!oscNodes.length && socketRef.current) {
            socketRef.current.disconnect()
            socketRef.current = null
        }

        // Web MIDI lifecycle: request once, on the first document that needs it.
        if (midiNodes.length && !midiRequestedRef.current && typeof navigator !== 'undefined' && navigator.requestMIDIAccess) {
            midiRequestedRef.current = true
            navigator.requestMIDIAccess({ sysex: false })
                .then((access) => { midiAccessRef.current = access })
                .catch(() => { midiAccessRef.current = null })
        }

        if (!oscNodes.length && !midiNodes.length) {
            lastSentRef.current.clear()
            primedRef.current = false
            return
        }

        const context = createNodeGraphContext(document)
        const lastSent = lastSentRef.current
        const priming = !primedRef.current

        const diffInput = (node, portId) => {
            const key = `${node.id}:${portId}`
            const next = evaluateNodeInput(node, portId, context)
            const changed = lastSent.get(key) !== next
            lastSent.set(key, next)
            return { next, changed: changed && !priming }
        }

        for (const node of oscNodes) {
            const address = evaluateNodeInput(node, 'address', context) || '/control'
            for (const portId of WATCHED_INPUTS) {
                const { next, changed } = diffInput(node, portId)
                if (!changed || next === undefined) continue
                socketRef.current?.emit('control-value', {
                    targetHost: node.values?.targetHost || '127.0.0.1',
                    targetPort: Number(node.values?.targetPort) || 9000,
                    address: String(address),
                    args: [asOscArg(next)]
                })
            }
        }

        for (const node of midiNodes) {
            const access = midiAccessRef.current
            const output = access ? pickMidiOutput(access, node.values?.midiPortName) : null
            const channel = Math.min(16, Math.max(1, Number(node.values?.channel) || 1)) - 1

            const valueDiff = diffInput(node, 'value')
            if (valueDiff.changed && valueDiff.next !== undefined && output) {
                const cc = asMidiByte(evaluateNodeInput(node, 'cc', context))
                output.send([0xb0 | channel, cc, asMidiByte(valueDiff.next)])
            }

            const triggerDiff = diffInput(node, 'trigger')
            if (triggerDiff.changed && output) {
                const note = asMidiByte(evaluateNodeInput(node, 'note', context))
                const velocity = asMidiByte(evaluateNodeInput(node, 'velocity', context))
                if (triggerDiff.next) {
                    output.send([0x90 | channel, note, Math.max(1, velocity)])
                } else {
                    output.send([0x80 | channel, note, 0])
                }
            }
        }

        primedRef.current = true
    }, [document, enabled])

    useEffect(() => () => {
        socketRef.current?.disconnect()
        socketRef.current = null
    }, [])
}
