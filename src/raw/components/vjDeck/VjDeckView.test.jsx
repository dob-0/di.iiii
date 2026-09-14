import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import VjDeckView from './VjDeckView.jsx'
import { createDeck, setClip, trigger } from '../../../project/tops/vjDeck.js'
import { topThumbnailTargets } from '../../../project/tops/topThumbnails.js'

const assets = [
    { id: 'asset-dusk', name: 'dusk_01.mp4', mimeType: 'video/mp4' },
    { id: 'asset-still', name: 'poster.png', mimeType: 'image/png' },
    { id: 'asset-rain', name: 'rain.webm', mimeType: 'video/webm' }
]

// The deck as a host holds it: node.values patched in place, like applyLocalOps.
function Host({ initialDeck = createDeck(), placement = 'window', onValues = () => {}, now, onUploadFile }) {
    const [node, setNode] = useState({ id: 'deck-1', typeId: 'vj.deck', values: { machine: '', deck: initialDeck } })
    return (
        <VjDeckView
            node={node}
            assets={assets}
            placement={placement}
            now={now}
            onUploadFile={onUploadFile}
            onPatchValues={(patch) => {
                setNode((current) => {
                    const next = { ...current, values: { ...current.values, ...patch } }
                    onValues(next.values)
                    return next
                })
            }}
        />
    )
}

const lastDeck = (spy) => spy.mock.calls.at(-1)[0].deck

describe('VjDeckView', () => {
    it('draws the column row, then the grid top layer first', () => {
        render(<Host />)
        const rows = screen.getAllByRole('group').map((row) => row.getAttribute('aria-label'))
        expect(rows).toEqual(['Columns', 'Layer 3', 'Layer 2', 'Layer 1'])
        expect(screen.getAllByRole('button', { name: /slot \d+/ })).toHaveLength(18)
        expect(screen.getByRole('button', { name: 'Play column 6' })).toBeTruthy()
        expect(screen.getByLabelText('Tempo').textContent).toBe('120.0')
    })

    it('an empty slot opens the picker: video assets only, and the four inputs', () => {
        const onValues = vi.fn()
        render(<Host onValues={onValues} />)
        fireEvent.click(screen.getByRole('button', { name: 'Layer 1, slot 2: add a clip' }))
        const picker = screen.getByRole('region', { name: 'Add a clip' })
        expect(within(picker).getByRole('button', { name: 'dusk_01.mp4' })).toBeTruthy()
        expect(within(picker).getByRole('button', { name: 'rain.webm' })).toBeTruthy()
        expect(within(picker).queryByRole('button', { name: 'poster.png' })).toBeNull()
        expect(within(picker).getByRole('button', { name: 'In 4' })).toBeTruthy()

        fireEvent.click(within(picker).getByRole('button', { name: 'rain.webm' }))
        const deck = lastDeck(onValues)
        expect(deck.layers[0].clips[1]).toMatchObject({ kind: 'asset', asset: 'asset-rain', label: 'rain.webm', speed: 1, mode: '0' })
        // The picker closes and the new clip's settings open.
        expect(screen.queryByRole('region', { name: 'Add a clip' })).toBeNull()
        expect(screen.getByRole('region', { name: 'Clip settings' })).toBeTruthy()
    })

    it('tapping a clip plays it on its layer, and again restarts it', () => {
        const onValues = vi.fn()
        render(<Host onValues={onValues} initialDeck={setClip(createDeck(), 2, 0, { id: 'c1', kind: 'asset', asset: 'asset-dusk', label: 'dusk' })} />)
        const tile = screen.getByRole('button', { name: 'Layer 3, slot 1: dusk' })
        expect(tile.getAttribute('aria-pressed')).toBe('false')
        fireEvent.click(tile)
        expect(lastDeck(onValues).layers[2]).toMatchObject({ active: 0, trigger: 1 })
        expect(screen.getByRole('button', { name: 'Layer 3, slot 1: dusk' }).getAttribute('aria-pressed')).toBe('true')
        fireEvent.click(screen.getByRole('button', { name: 'Layer 3, slot 1: dusk' }))
        expect(lastDeck(onValues).layers[2].trigger).toBe(2)
        fireEvent.click(screen.getByRole('button', { name: 'Clear Layer 3' }))
        expect(lastDeck(onValues).layers[2].active).toBe(-1)
    })

    it('a playing asset clip hands its canvas to the picture runner under the expanded id', () => {
        const deck = trigger(setClip(createDeck(), 0, 0, { id: 'c1', kind: 'asset', asset: 'asset-dusk' }), 0, 0)
        const { unmount } = render(<Host initialDeck={deck} />)
        // jsdom has no 2D context, so the registration is a no-op there — the
        // canvases are what must exist, named for what they will show.
        expect(screen.getByRole('img', { name: 'dusk_01.mp4' })).toBeTruthy()
        expect(screen.getByRole('img', { name: 'Deck output' })).toBeTruthy()
        unmount()
        expect([...topThumbnailTargets().keys()].some((id) => id.startsWith('deck-1'))).toBe(false)
    })

    it('opacity, blend, master and column trigger write the deck', () => {
        const onValues = vi.fn()
        let deck = setClip(createDeck(), 0, 3, { id: 'a', kind: 'input', input: 'in1' })
        deck = setClip(deck, 1, 3, { id: 'b', kind: 'asset', asset: 'asset-dusk' })
        render(<Host onValues={onValues} initialDeck={deck} />)
        fireEvent.change(screen.getByLabelText('Layer 2 opacity'), { target: { value: '0.3' } })
        expect(lastDeck(onValues).layers[1].opacity).toBe(0.3)
        fireEvent.change(screen.getByLabelText('Layer 2 blend'), { target: { value: '4' } })
        expect(lastDeck(onValues).layers[1].blend).toBe('4')
        fireEvent.change(screen.getByLabelText('Master'), { target: { value: '0.5' } })
        expect(lastDeck(onValues).master).toBe(0.5)
        fireEvent.click(screen.getByRole('button', { name: 'Play column 4' }))
        expect(lastDeck(onValues).layers.map((layer) => layer.active)).toEqual([3, 3, -1])
    })

    it('tap tempo sets the bpm from the taps', () => {
        const onValues = vi.fn()
        const times = [1000, 1500, 2000]
        render(<Host onValues={onValues} now={() => times.shift()} />)
        const tap = screen.getByRole('button', { name: 'Tap' })
        fireEvent.click(tap)
        expect(onValues).not.toHaveBeenCalled()
        fireEvent.click(tap)
        fireEvent.click(tap)
        expect(lastDeck(onValues).bpm).toBe(120)
        expect(screen.getByLabelText('Tempo').textContent).toBe('120.0')
    })

    it('clip settings change speed, mode and in/out; remove empties the slot', () => {
        const onValues = vi.fn()
        render(<Host onValues={onValues} initialDeck={setClip(createDeck(), 0, 0, { id: 'c1', kind: 'asset', asset: 'asset-dusk' })} />)
        fireEvent.click(screen.getByRole('button', { name: 'Layer 1, slot 1: dusk_01.mp4' }))
        const settings = screen.getByRole('region', { name: 'Clip settings' })
        fireEvent.change(within(settings).getByLabelText('Speed'), { target: { value: '2.5' } })
        expect(lastDeck(onValues).layers[0].clips[0].speed).toBe(2.5)
        fireEvent.click(within(settings).getByRole('radio', { name: 'Bounce' }))
        expect(lastDeck(onValues).layers[0].clips[0].mode).toBe('1')
        expect(within(settings).getByRole('radio', { name: 'Bounce' }).getAttribute('aria-checked')).toBe('true')
        fireEvent.change(within(settings).getByLabelText('In point'), { target: { value: '0.25' } })
        fireEvent.change(within(settings).getByLabelText('Out point'), { target: { value: '0.75' } })
        expect(lastDeck(onValues).layers[0].clips[0]).toMatchObject({ in: 0.25, out: 0.75 })
        fireEvent.click(within(settings).getByRole('button', { name: 'Remove clip' }))
        expect(lastDeck(onValues).layers[0].clips[0]).toBeNull()
        expect(screen.queryByRole('region', { name: 'Clip settings' })).toBeNull()
    })

    it('an upload lands in the slot it was picked for', async () => {
        const onValues = vi.fn()
        const onUploadFile = vi.fn(async (file) => ({ id: 'asset-new', name: file.name }))
        render(<Host onValues={onValues} onUploadFile={onUploadFile} />)
        fireEvent.click(screen.getByRole('button', { name: 'Layer 2, slot 3: add a clip' }))
        const input = screen.getByLabelText('Upload video')
        const file = new File(['x'], 'fresh.mp4', { type: 'video/mp4' })
        fireEvent.change(input, { target: { files: [file] } })
        await vi.waitFor(() => expect(onUploadFile).toHaveBeenCalledWith(file))
        await vi.waitFor(() => expect(lastDeck(onValues).layers[1].clips[2]).toMatchObject({ asset: 'asset-new', label: 'fresh.mp4' }))
    })

    it('every placement behaves the same; only the density class differs', () => {
        for (const placement of ['window', 'inside', 'perform']) {
            const onValues = vi.fn()
            const { container, unmount } = render(<Host placement={placement} onValues={onValues} initialDeck={setClip(createDeck(), 0, 0, { id: 'c1', kind: 'asset', asset: 'asset-dusk' })} />)
            expect(container.querySelector(`.vj-deck--${placement}`)).toBeTruthy()
            fireEvent.click(screen.getByRole('button', { name: 'Layer 1, slot 1: dusk_01.mp4' }))
            expect(lastDeck(onValues).layers[0]).toMatchObject({ active: 0, trigger: 1 })
            unmount()
        }
    })

    it('without a writer nothing pretends to be live', () => {
        render(<VjDeckView node={{ id: 'd', typeId: 'vj.deck', values: {} }} assets={assets} />)
        expect(screen.getByRole('button', { name: 'Tap' }).disabled).toBe(true)
        expect(screen.getByRole('button', { name: 'Layer 1, slot 1: add a clip' }).disabled).toBe(true)
        expect(screen.getAllByRole('button', { name: /slot \d+/ })).toHaveLength(18)
    })
})
