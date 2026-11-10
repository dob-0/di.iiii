import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import VjDeckView from '../../raw/components/vjDeck/VjDeckView.jsx'
import { createDeck, setClip } from '../../project/tops/vjDeck.js'

// A fake Web MIDI access at the navigator boundary: one K2 in, one K2 out.
const fakeAccess = () => {
    const sent = []
    const input = { id: 'in-k2', name: 'XONE:K2 MIDI 1', manufacturer: 'Allen & Heath', onmidimessage: null }
    const output = { id: 'out-k2', name: 'XONE:K2 MIDI 1', manufacturer: 'Allen & Heath', send: (data) => sent.push([...data]) }
    return { sent, input, access: { inputs: new Map([[input.id, input]]), outputs: new Map([[output.id, output]]), onstatechange: null } }
}

function Host({ values }) {
    const [node, setNode] = useState({ id: 'deck-1', typeId: 'vj.deck', values })
    return <VjDeckView node={node} onPatchValues={(patch) => setNode((n) => ({ ...n, values: { ...n.values, ...patch } }))} />
}

afterEach(() => { vi.unstubAllGlobals() })

describe('VjDeckView with a K2', () => {
    it('plays from MIDI, lights the K2, and learns a control from the screen', async () => {
        const fake = fakeAccess()
        vi.stubGlobal('navigator', { ...globalThis.navigator, requestMIDIAccess: () => Promise.resolve(fake.access) })
        let deck = createDeck({ layers: 2, columns: 4 })
        deck = setClip(deck, 0, 0, { kind: 'input', input: 'in1' })
        render(<Host values={{ deck }} />)
        await waitFor(() => expect(screen.getByRole('status', { name: '' }).textContent).toContain('K2'))
        await waitFor(() => expect(fake.input.onmidimessage).toBeTypeOf('function'))

        act(() => fake.input.onmidimessage({ data: [0x9e, 36, 127] })) // matrix A: layer 1, column 1
        await waitFor(() => expect(screen.getByLabelText(/Layer 1, slot 1/).getAttribute('aria-pressed')).toBe('true'))
        await waitFor(() => expect(fake.sent).toContainEqual([0x9e, 108, 127])) // matrix A green note, from the sheet

        act(() => fake.input.onmidimessage({ data: [0xbe, 17, 0] })) // fader 2: layer 2 opacity 0
        await waitFor(() => expect(screen.getByLabelText('Layer 2 opacity').value).toBe('0'))

        // Learn: MIDI on, click the Master slider, move a pot.
        fireEvent.click(screen.getByRole('button', { name: 'MIDI' }))
        fireEvent.click(screen.getByLabelText('Master'))
        act(() => fake.input.onmidimessage({ data: [0xbe, 12, 0] }))
        fireEvent.click(screen.getByRole('button', { name: 'MIDI' }))
        act(() => fake.input.onmidimessage({ data: [0xbe, 12, 64] }))
        await waitFor(() => expect(Number(screen.getByLabelText('Master').value)).toBeCloseTo(64 / 127, 2))
    })
})
