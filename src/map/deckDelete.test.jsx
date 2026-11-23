import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { MapDeck } from './MapDeskDock.jsx'

// Audit 11-12: a clicked clip tile keeps focus, so one stray Delete removed the
// clip ON THE WALL and blacked it mid-set. That one now needs a second Delete
// within 3 s; any other clip goes at once.
const visuals = [
    { id: 'a', name: 'Riley · Blaze', source: { kind: 'html', ref: '/a.html' }, effects: [] },
    { id: 'b', name: 'Vasarely · Vega', source: { kind: 'html', ref: '/b.html' }, effects: [] }
]
const deck = (onDelete) => render(
    <MapDeck visuals={visuals} playing="a" selectedVisualId="b" fade={0}
        upload={{ busy: false, notice: '', tone: 'ok', bringIn: async () => [] }}
        addChoices={[]} fileAccept=""
        onPlay={() => {}} onSelect={() => {}} onAdd={() => {}} onFade={() => {}} onReorder={() => {}}
        onDropEffect={() => {}} onDelete={onDelete} />
)

describe('Delete on a clip tile', () => {
    it('the clip on the wall needs a second Delete, and the deck says so', () => {
        const onDelete = vi.fn()
        const { getByTitle, getByText } = deck(onDelete)
        const live = getByTitle(/Play “Riley · Blaze”/)
        fireEvent.keyDown(live, { key: 'Delete' })
        expect(onDelete).not.toHaveBeenCalled()
        expect(getByText(/is on the wall\. Press Delete again/)).toBeTruthy()
        fireEvent.keyDown(live, { key: 'Delete' })
        expect(onDelete).toHaveBeenCalledWith('a')
    })

    it('a second Delete after 3 s asks again', () => {
        vi.useFakeTimers()
        try {
            const onDelete = vi.fn()
            const { getByTitle } = deck(onDelete)
            const live = getByTitle(/Play “Riley · Blaze”/)
            fireEvent.keyDown(live, { key: 'Delete' })
            vi.advanceTimersByTime(4000)
            fireEvent.keyDown(live, { key: 'Delete' })
            expect(onDelete).not.toHaveBeenCalled()
        } finally { vi.useRealTimers() }
    })

    it('any other clip, and the × button, go at once', () => {
        const onDelete = vi.fn()
        const { getByTitle, getByRole } = deck(onDelete)
        fireEvent.keyDown(getByTitle(/Play “Vasarely · Vega”/), { key: 'Delete' })
        expect(onDelete).toHaveBeenLastCalledWith('b')
        fireEvent.click(getByRole('button', { name: 'Remove “Riley · Blaze”' }))
        expect(onDelete).toHaveBeenLastCalledWith('a')
    })
})
