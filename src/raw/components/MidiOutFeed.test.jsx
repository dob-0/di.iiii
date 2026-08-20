import { render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MidiOutFeed from './MidiOutFeed.jsx'

const node = { id: 'mo-1', typeId: 'device.midi.out', values: {} }

// The sending mirror of MidiInputPanel's fake: no hardware here or in CI, so
// the port is faked at the navigator boundary and the bytes are recorded.
const fakeMidiOut = ({ outputs = [{ id: 'out-1', name: 'Fake Synth' }] } = {}) => {
    const sent = []
    const ports = outputs.map((output) => ({
        ...output,
        send: (data) => sent.push([...data])
    }))
    const access = {
        inputs: { values: () => [].values() },
        outputs: { values: () => ports.values() },
        onstatechange: null
    }
    navigator.requestMIDIAccess = vi.fn(async () => access)
    return { access, ports, sent }
}

afterEach(() => { delete navigator.requestMIDIAccess })

describe('MidiOutFeed', () => {
    it('reports what it is doing through the status side channel', async () => {
        fakeMidiOut()
        const onStatus = vi.fn()
        render(<MidiOutFeed node={node} inputs={{}} onStatus={onStatus} />)
        await waitFor(() => expect(onStatus).toHaveBeenCalledWith('mo-1', 'Sending to 1 device'))
    })

    it('says so when the browser has no Web MIDI', async () => {
        delete navigator.requestMIDIAccess
        const onStatus = vi.fn()
        render(<MidiOutFeed node={node} inputs={{}} onStatus={onStatus} />)
        await waitFor(() => expect(onStatus).toHaveBeenCalledWith('mo-1', expect.stringMatching(/no Web MIDI/i)))
    })

    it('a rising trigger strikes the note, the fall releases the SAME note', async () => {
        const midi = fakeMidiOut()
        const { rerender } = render(
            <MidiOutFeed node={node} inputs={{ trigger: false, note: 60, velocity: 100, channel: 1 }} />
        )
        await waitFor(() => expect(navigator.requestMIDIAccess).toHaveBeenCalled())
        rerender(<MidiOutFeed node={node} inputs={{ trigger: true, note: 60, velocity: 100, channel: 1 }} />)
        await waitFor(() => expect(midi.sent).toContainEqual([0x90, 60, 100]))
        // the note moves while held — release must name the STRUCK note
        rerender(<MidiOutFeed node={node} inputs={{ trigger: true, note: 64, velocity: 100, channel: 1 }} />)
        rerender(<MidiOutFeed node={node} inputs={{ trigger: false, note: 64, velocity: 100, channel: 1 }} />)
        await waitFor(() => expect(midi.sent).toContainEqual([0x80, 60, 0]))
        expect(midi.sent).not.toContainEqual([0x80, 64, 0])
    })

    it('a trigger that stays truthy but changes re-strikes — the rising-count idiom', async () => {
        const midi = fakeMidiOut()
        const { rerender } = render(
            <MidiOutFeed node={node} inputs={{ trigger: 1, note: 60, velocity: 90, channel: 1 }} />
        )
        await waitFor(() => expect(navigator.requestMIDIAccess).toHaveBeenCalled())
        rerender(<MidiOutFeed node={node} inputs={{ trigger: 2, note: 62, velocity: 90, channel: 1 }} />)
        await waitFor(() => expect(midi.sent).toContainEqual([0x90, 62, 90]))
    })

    it('a changed Value leaves as CC on the chosen channel; an unchanged one sends nothing', async () => {
        const midi = fakeMidiOut()
        const { rerender } = render(
            <MidiOutFeed node={node} inputs={{ value: 10, cc: 7, channel: 2 }} />
        )
        await waitFor(() => expect(navigator.requestMIDIAccess).toHaveBeenCalled())
        const before = midi.sent.length
        rerender(<MidiOutFeed node={node} inputs={{ value: 10, cc: 7, channel: 2 }} />)
        expect(midi.sent.length).toBe(before)
        rerender(<MidiOutFeed node={node} inputs={{ value: 99, cc: 7, channel: 2 }} />)
        await waitFor(() => expect(midi.sent).toContainEqual([0xb1, 7, 99]))
    })

    it('unmounting with a note sounding releases it — no stuck keys', async () => {
        const midi = fakeMidiOut()
        const { rerender, unmount } = render(
            <MidiOutFeed node={node} inputs={{ trigger: false, note: 60, velocity: 100, channel: 1 }} />
        )
        await waitFor(() => expect(navigator.requestMIDIAccess).toHaveBeenCalled())
        rerender(<MidiOutFeed node={node} inputs={{ trigger: true, note: 60, velocity: 100, channel: 1 }} />)
        await waitFor(() => expect(midi.sent).toContainEqual([0x90, 60, 100]))
        unmount()
        expect(midi.sent).toContainEqual([0x80, 60, 0])
    })
})
