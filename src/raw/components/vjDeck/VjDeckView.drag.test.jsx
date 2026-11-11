import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import VjDeckView from './VjDeckView.jsx'
import { createDeck, setClip, trigger } from '../../../project/tops/vjDeck.js'

const assets = [{ id: 'asset-rain', name: 'rain.webm', mimeType: 'video/webm' }]
const clip = (asset) => ({ id: `c-${asset}`, kind: 'asset', asset, label: asset })

function Host({ initialDeck, onValues = () => {} }) {
    const [node, setNode] = useState({ id: 'deck-1', typeId: 'vj.deck', values: { machine: '', deck: initialDeck } })
    return <VjDeckView node={node} assets={assets} onPatchValues={(patch) => setNode((c) => { const next = { ...c, values: { ...c.values, ...patch } }; onValues(next.values); return next })} />
}
const last = (spy) => spy.mock.calls.at(-1)[0].deck
const slot = (layer, column) => screen.getByRole('button', { name: new RegExp(`^Layer ${layer}, slot ${column}:`) })
// A dataTransfer that remembers what was set, like a browser's for one drag.
const transfer = () => {
    const data = {}
    return { data, types: [], setData(type, value) { data[type] = value; this.types = Object.keys(data) }, getData: (type) => data[type] || '', effectAllowed: '', dropEffect: '' }
}

describe('drag and drop on the deck', () => {
    const start = () => trigger(setClip(setClip(createDeck(), 0, 0, clip('a')), 0, 2, clip('b')), 0, 0)

    it('only a filled tile is draggable', () => {
        render(<Host initialDeck={start()} />)
        expect(slot(1, 1).getAttribute('draggable')).toBe('true')
        expect(slot(1, 2).getAttribute('draggable')).toBe('false')
    })

    it('dragging a clip onto an empty slot moves it, and the playing column follows', () => {
        const onValues = vi.fn()
        render(<Host initialDeck={start()} onValues={onValues} />)
        const dt = transfer()
        fireEvent.dragStart(slot(1, 1), { dataTransfer: dt })
        expect(JSON.parse(dt.data['application/x-di-deck-clip'])).toEqual({ layer: 0, column: 0 })
        fireEvent.dragOver(slot(1, 5), { dataTransfer: dt })
        expect(slot(1, 5).className).toContain('is-drop-target')
        fireEvent.drop(slot(1, 5), { dataTransfer: dt })
        const deck = last(onValues)
        expect(deck.layers[0].clips[0]).toBeNull()
        expect(deck.layers[0].clips[4]).toMatchObject({ asset: 'a' })
        expect(deck.layers[0].active).toBe(4)
        expect(slot(1, 5).className).not.toContain('is-drop-target')
    })

    it('dropping on a filled slot swaps; dropping on another layer moves it there', () => {
        const onValues = vi.fn()
        render(<Host initialDeck={start()} onValues={onValues} />)
        const dt = transfer()
        fireEvent.dragStart(slot(1, 1), { dataTransfer: dt })
        fireEvent.drop(slot(1, 3), { dataTransfer: dt })
        expect(last(onValues).layers[0].clips.map((c) => c?.asset ?? null).slice(0, 3)).toEqual(['b', null, 'a'])
        const dt2 = transfer()
        fireEvent.dragStart(slot(1, 3), { dataTransfer: dt2 })
        fireEvent.drop(slot(3, 1), { dataTransfer: dt2 })
        expect(last(onValues).layers[2].clips[0]).toMatchObject({ asset: 'a' })
    })

    it('a drag that is not ours is not accepted', () => {
        const onValues = vi.fn()
        render(<Host initialDeck={start()} onValues={onValues} />)
        const dt = { types: ['Files'], getData: () => '' }
        expect(fireEvent.dragOver(slot(1, 5), { dataTransfer: dt })).toBe(true)
        fireEvent.drop(slot(1, 5), { dataTransfer: dt })
        expect(onValues).not.toHaveBeenCalled()
    })

    it('a plain click still previews and triggers', () => {
        const onValues = vi.fn()
        render(<Host initialDeck={start()} onValues={onValues} />)
        fireEvent.click(slot(1, 3))
        expect(last(onValues).layers[0].active).toBe(2)
        expect(slot(1, 3).className).toContain('is-selected')
    })

    it('a Sources row dragged onto a slot puts that source there', () => {
        const onValues = vi.fn()
        render(<Host initialDeck={createDeck()} onValues={onValues} />)
        const sources = screen.getByRole('region', { name: 'Sources' })
        const row = within(sources).getByRole('button', { name: 'rain.webm' }).closest('.vj-deck-source')
        expect(row.getAttribute('draggable')).toBe('true')
        const dt = transfer()
        fireEvent.dragStart(row, { dataTransfer: dt })
        expect(Object.keys(dt.data)).toEqual(['application/x-di-deck-source'])
        fireEvent.dragOver(slot(2, 4), { dataTransfer: dt })
        fireEvent.drop(slot(2, 4), { dataTransfer: dt })
        expect(last(onValues).layers[1].clips[3]).toMatchObject({ kind: 'asset', asset: 'asset-rain' })
    })

    it('the Sources list is always there: inputs and video rows, a click needs a selected slot', () => {
        const onValues = vi.fn()
        render(<Host initialDeck={start()} onValues={onValues} />)
        const sources = screen.getByRole('region', { name: 'Sources' })
        expect(within(sources).getByRole('button', { name: 'In 1' }).disabled).toBe(true)
        expect(within(sources).getByRole('button', { name: 'In 4' })).toBeTruthy()
        fireEvent.click(slot(1, 3))
        fireEvent.click(within(sources).getByRole('button', { name: 'rain.webm' }))
        expect(last(onValues).layers[0].clips[2]).toMatchObject({ asset: 'asset-rain' })
    })
})
