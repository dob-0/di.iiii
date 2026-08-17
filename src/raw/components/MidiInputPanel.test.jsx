import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MidiInputPanel, { noteName } from './MidiInputPanel.jsx'

const node = { id: 'midi-1', typeId: 'device.midi.in', values: {} }

// A stand-in for a controller. There is no MIDI hardware on this machine and
// none in CI, so the port is faked at the browser API boundary — the panel and
// the parsing above it are the real code.
const fakeMidi = ({ inputs = [{ id: 'in-1', name: 'Fake Controller' }] } = {}) => {
    const ports = inputs.map((input) => ({ ...input, onmidimessage: null }))
    const access = {
        inputs: { values: () => ports.values() },
        onstatechange: null
    }
    navigator.requestMIDIAccess = vi.fn(async () => access)
    return {
        access,
        ports,
        send: (data) => ports.forEach((p) => p.onmidimessage?.({ data }))
    }
}

afterEach(() => { delete navigator.requestMIDIAccess })

describe('MidiInputPanel', () => {
    it('says so when the browser has no Web MIDI, instead of sitting blank', async () => {
        delete navigator.requestMIDIAccess
        render(<MidiInputPanel node={node} values={{}} />)
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/no Web MIDI/i))
    })

    it('says so when permission is refused', async () => {
        navigator.requestMIDIAccess = vi.fn(async () => {
            const error = new Error('denied')
            error.name = 'SecurityError'
            throw error
        })
        render(<MidiInputPanel node={node} values={{}} />)
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/denied/i))
    })

    it('says so when nothing is plugged in', async () => {
        fakeMidi({ inputs: [] })
        render(<MidiInputPanel node={node} values={{}} />)
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/No MIDI devices/i))
    })

    it('publishes note, velocity and a rising trigger on a note on', async () => {
        const midi = fakeMidi()
        const onSignalChange = vi.fn()
        render(<MidiInputPanel node={node} values={{ channel: 0 }} onSignalChange={onSignalChange} />)
        await waitFor(() => expect(midi.ports[0].onmidimessage).toBeTypeOf('function'))

        midi.send(new Uint8Array([0x90, 60, 100]))
        await waitFor(() => expect(onSignalChange).toHaveBeenCalledWith(
            'midi-1', { note: 60, velocity: 100, trigger: 1 }
        ))

        midi.send(new Uint8Array([0x90, 62, 90]))
        await waitFor(() => expect(onSignalChange).toHaveBeenLastCalledWith(
            'midi-1', { note: 62, velocity: 90, trigger: 2 }
        ))
    })

    it('a CC does not wipe the last note — they are separate ports', async () => {
        const midi = fakeMidi()
        const onSignalChange = vi.fn()
        render(<MidiInputPanel node={node} values={{ channel: 0 }} onSignalChange={onSignalChange} />)
        await waitFor(() => expect(midi.ports[0].onmidimessage).toBeTypeOf('function'))

        midi.send(new Uint8Array([0xb0, 74, 64]))
        await waitFor(() => expect(onSignalChange).toHaveBeenLastCalledWith(
            'midi-1', { cc: 74, value: 64, trigger: 1 }
        ))
        // No note/velocity keys in the CC payload, so RawEditor leaves those
        // ports as they were.
        expect(onSignalChange.mock.lastCall[1]).not.toHaveProperty('note')
    })

    it('ignores a channel it was not asked to listen on', async () => {
        const midi = fakeMidi()
        const onSignalChange = vi.fn()
        render(<MidiInputPanel node={node} values={{ channel: 3 }} onSignalChange={onSignalChange} />)
        await waitFor(() => expect(midi.ports[0].onmidimessage).toBeTypeOf('function'))

        midi.send(new Uint8Array([0x90, 60, 100]))       // channel 1
        await new Promise((r) => setTimeout(r, 20))
        expect(onSignalChange).not.toHaveBeenCalled()

        midi.send(new Uint8Array([0x92, 60, 100]))       // channel 3
        await waitFor(() => expect(onSignalChange).toHaveBeenCalled())
    })

    it('shows a controller that is plugged in after the page opened', async () => {
        // Hotplug is the normal case at a venue.
        const ports = []
        const access = { inputs: { values: () => ports.values() }, onstatechange: null }
        navigator.requestMIDIAccess = vi.fn(async () => access)

        render(<MidiInputPanel node={node} values={{}} />)
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/No MIDI devices/i))

        ports.push({ id: 'in-late', name: 'Late Controller', onmidimessage: null })
        access.onstatechange()

        await waitFor(() => expect(screen.getByText('Late Controller')).toBeInTheDocument())
    })

    it('clears every port on unmount', async () => {
        fakeMidi()
        const onSignalChange = vi.fn()
        const { unmount } = render(
            <MidiInputPanel node={node} values={{}} onSignalChange={onSignalChange} />
        )
        unmount()
        expect(onSignalChange).toHaveBeenCalledWith('midi-1', null)
    })
})

describe('noteName', () => {
    it('names middle C the way a controller prints it', () => {
        expect(noteName(60)).toBe('C4')
        expect(noteName(69)).toBe('A4')
        expect(noteName(0)).toBe('C-1')
    })
})
