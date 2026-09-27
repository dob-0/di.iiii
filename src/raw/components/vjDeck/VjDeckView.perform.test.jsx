import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createDeck, setClip, trigger } from '../../../project/tops/vjDeck.js'
import { ShowClockContext } from '../../../perform/useShowClock.js'

// The three flaws the owner saw on his screen on 2026-09-24, and the one clock.

vi.mock('./clipStills.js', () => ({
    clipStill: vi.fn(async (url) => (url ? `data:image/jpeg;base64,still-of-${encodeURIComponent(url)}` : null))
}))

const { default: VjDeckView } = await import('./VjDeckView.jsx')

const assets = [
    { id: 'asset-dusk', name: 'dusk_01.mp4', mimeType: 'video/mp4', url: '/serverXR/api/projects/p/assets/asset-dusk' },
    { id: 'asset-rain', name: 'rain.webm', mimeType: 'video/webm', url: '/serverXR/api/projects/p/assets/asset-rain' }
]

function Host({ initialDeck = createDeck(), onValues = () => {}, now }) {
    const [node, setNode] = useState({ id: 'deck-1', typeId: 'vj.deck', values: { machine: '', deck: initialDeck } })
    return (
        <VjDeckView
            node={node}
            assets={assets}
            projectId="p"
            now={now}
            onPatchValues={(patch) => setNode((current) => {
                const next = { ...current, values: { ...current.values, ...patch } }
                onValues(next.values)
                return next
            })}
        />
    )
}

describe('the deck, as the owner saw it on 2026-09-24', () => {
    it('every filled slot shows a still of its clip, not only the playing one (Resolume’s grid)', async () => {
        let deck = setClip(createDeck(), 0, 0, { id: 'c1', kind: 'asset', asset: 'asset-dusk' })
        deck = setClip(deck, 0, 1, { id: 'c2', kind: 'asset', asset: 'asset-rain' })
        deck = trigger(deck, 0, 0)
        render(<Host initialDeck={deck} />)
        await act(async () => {})
        const stills = document.querySelectorAll('.vj-deck-tile-still')
        expect([...stills].map((img) => img.getAttribute('data-still-of')).sort()).toEqual(['dusk_01.mp4', 'rain.webm'])
        // An empty slot has no picture at all.
        const empty = screen.getByRole('button', { name: 'Layer 1, slot 3: add a clip' })
        expect(empty.querySelector('img')).toBe(null)
    })

    it('the blend has a line to itself, so "Difference" is never squeezed beside Clear', () => {
        render(<Host />)
        const blend = screen.getByLabelText('Layer 1 blend')
        const line = blend.closest('.vj-deck-layer-line')
        expect([...line.querySelectorAll('button, select, input')]).toEqual([blend])
        expect(screen.getByRole('button', { name: 'Clear Layer 1' }).closest('.vj-deck-layer-line')).not.toBe(line)
    })

    it('reset puts a 300 back to 120 with the beat on this instant', () => {
        const onValues = vi.fn()
        render(<Host initialDeck={{ ...createDeck(), bpm: 300 }} onValues={onValues} now={() => 4242} />)
        expect(screen.getByLabelText('Tempo').textContent).toBe('300.0')
        fireEvent.click(screen.getByRole('button', { name: 'Reset the tempo to 120' }))
        expect(onValues.mock.calls.at(-1)[0].deck).toMatchObject({ bpm: 120, epoch: 4242 })
        expect(screen.getByLabelText('Tempo').textContent).toBe('120.0')
    })
})

describe('the deck on a page with one show clock', () => {
    const clockValue = (overrides = {}) => ({
        leader: 'light',
        timeline: { bpm: 128, epoch: 0 },
        tap: vi.fn(),
        reset: vi.fn(),
        ...overrides
    })

    it('shows the show clock’s tempo, says it follows Light, and its Tap goes to the clock', () => {
        const clock = clockValue()
        render(
            <ShowClockContext.Provider value={clock}>
                <Host initialDeck={{ ...createDeck(), bpm: 90 }} />
            </ShowClockContext.Provider>
        )
        expect(screen.getByLabelText('Tempo').textContent).toBe('128.0')
        expect(screen.getByText('follows Light')).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'Tap' }))
        expect(clock.tap).toHaveBeenCalledTimes(1)
        fireEvent.click(screen.getByRole('button', { name: 'Reset the tempo to 120' }))
        expect(clock.reset).toHaveBeenCalledTimes(1)
    })

    it('with no Light desk up the clock is the deck’s own, and nothing says Light', () => {
        render(
            <ShowClockContext.Provider value={clockValue({ leader: 'deck', timeline: { bpm: 90, epoch: 0 } })}>
                <Host initialDeck={{ ...createDeck(), bpm: 90 }} />
            </ShowClockContext.Provider>
        )
        expect(screen.getByLabelText('Tempo').textContent).toBe('90.0')
        expect(screen.queryByText('follows Light')).toBe(null)
    })
})
