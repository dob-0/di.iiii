import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import VjDeckView from './VjDeckView.jsx'
import { addEffect, createDeck, setClip } from '../../../project/tops/vjDeck.js'

function Host({ initialDeck, onValues = () => {} }) {
    const [node, setNode] = useState({ id: 'deck-1', typeId: 'vj.deck', values: { machine: '', deck: initialDeck } })
    return <VjDeckView node={node} onPatchValues={(patch) => setNode((c) => { const next = { ...c, values: { ...c.values, ...patch } }; onValues(next.values); return next })} />
}
const last = (spy) => spy.mock.calls.at(-1)[0].deck
const panel = () => screen.getByRole('region', { name: 'Effects' })

describe('the EFFECTS panel', () => {
    it('adds an effect from the list of operator names, to the chosen layer', () => {
        const onValues = vi.fn()
        render(<Host initialDeck={createDeck()} onValues={onValues} />)
        const add = within(panel()).getByLabelText('Add effect')
        expect(Array.from(add.options).map((o) => o.textContent)).toEqual(['+ Add effect', 'Level', 'Tint', 'Blur', 'Edge', 'Feedback', 'Reframe', 'Freeze', 'Silhouette', 'Line art', 'Body', 'Glitch', 'Pixelate', 'Displace', 'Colour shift', 'Mirror', 'Key', 'Grade', 'Emboss', 'Glow'])
        fireEvent.change(within(panel()).getByLabelText('Effects layer'), { target: { value: '1' } })
        fireEvent.change(add, { target: { value: 'top.blur' } })
        expect(last(onValues).layers[1].effects.map((e) => e.type)).toEqual(['top.blur'])
        expect(last(onValues).layers[0].effects).toEqual([])
        expect(within(panel()).getByRole('group', { name: 'Blur effect' })).toBeTruthy()
    })
    it('toggles, changes mix and a param (written to the deck), with MIDI targets on the sliders', () => {
        const onValues = vi.fn()
        render(<Host initialDeck={addEffect(createDeck(), 0, 'top.blur')} onValues={onValues} />)
        const p = within(panel())
        fireEvent.click(p.getByRole('button', { name: 'Blur on' }))
        expect(last(onValues).layers[0].effects[0].on).toBe(false)
        fireEvent.change(p.getByLabelText('Blur mix'), { target: { value: '0.4' } })
        expect(last(onValues).layers[0].effects[0].mix).toBe(0.4)
        const size = p.getByLabelText('Blur Size')
        fireEvent.change(size, { target: { value: '7' } })
        expect(last(onValues).layers[0].effects[0].params.size).toBe(7)
        expect(p.getByLabelText('Blur mix').getAttribute('data-midi-target')).toBe('fxmix:0:0')
        expect(size.getAttribute('data-midi-target')).toBe('fxp:0:0:0')
    })
    it('removes and reorders', () => {
        const onValues = vi.fn()
        render(<Host initialDeck={addEffect(addEffect(createDeck(), 0, 'top.tint'), 0, 'top.blur')} onValues={onValues} />)
        const p = within(panel())
        expect(p.getByRole('button', { name: 'Move Tint up' }).disabled).toBe(true)
        fireEvent.click(p.getByRole('button', { name: 'Move Tint down' }))
        expect(last(onValues).layers[0].effects.map((e) => e.type)).toEqual(['top.blur', 'top.tint'])
        fireEvent.click(p.getByRole('button', { name: 'Remove Blur' }))
        expect(last(onValues).layers[0].effects.map((e) => e.type)).toEqual(['top.tint'])
    })
    it('the master switch shows and edits the master stack; the layer follows the selected clip', () => {
        const onValues = vi.fn()
        let deck = setClip(createDeck(), 2, 0, { kind: 'asset', asset: 'a' })
        deck = addEffect(deck, 'master', 'top.edge')
        render(<Host initialDeck={deck} onValues={onValues} />)
        const p = within(panel())
        expect(p.queryByRole('group', { name: 'Edge effect' })).toBeNull()
        fireEvent.click(p.getByRole('radio', { name: 'Master' }))
        expect(p.getByRole('group', { name: 'Edge effect' })).toBeTruthy()
        expect(p.getByLabelText('Edge Strength').getAttribute('data-midi-target')).toBe('fxp:m:0:0')
        fireEvent.change(p.getByLabelText('Edge Strength'), { target: { value: '5' } })
        expect(last(onValues).effects[0].params.strength).toBe(5)
        fireEvent.click(p.getByRole('radio', { name: 'Layer' }))
        fireEvent.click(screen.getByRole('button', { name: /Layer 3, slot 1/ }))
        expect(p.getByLabelText('Effects layer').value).toBe('2')
    })
})
