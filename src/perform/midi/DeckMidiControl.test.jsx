import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import DeckMidiControl from './DeckMidiControl.jsx'

afterEach(cleanup)

describe('DeckMidiControl Reset', () => {
    const midi = (extra) => ({ state: 'absent', deviceName: '', learning: false, target: null, bindings: 5, toggleLearn: () => {}, reset: vi.fn(), ...extra })

    it('is not there while Learn is off, even with stored bindings', () => {
        render(<DeckMidiControl midi={midi()} />)
        expect(screen.queryByRole('button', { name: /Reset MIDI/ })).toBeNull()
    })

    it('is there while Learn is on, and calls reset', () => {
        const m = midi({ learning: true })
        render(<DeckMidiControl midi={m} />)
        fireEvent.click(screen.getByRole('button', { name: /Reset MIDI/ }))
        expect(m.reset).toHaveBeenCalledTimes(1)
    })
})
