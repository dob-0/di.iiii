import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import VjDeckView from '../../raw/components/vjDeck/VjDeckView.jsx'
import { createDeck, setClip, setMaster } from '../../project/tops/vjDeck.js'

const fakeAccess = () => {
    const input = { id: 'in-k2', name: 'XONE:K2 MIDI 1', manufacturer: 'Allen & Heath', onmidimessage: null }
    const output = { id: 'out-k2', name: 'XONE:K2 MIDI 1', manufacturer: 'Allen & Heath', state: 'connected', send: () => {} }
    return { input, access: { inputs: new Map([[input.id, input]]), outputs: new Map([[output.id, output]]), onstatechange: null } }
}
const baseDeck = () => setMaster(setClip(createDeck({ layers: 2, columns: 6 }), 0, 0, { kind: 'input', input: 'in1' }), 0.3)

function Host({ values, editable = true, onValues }) {
    const [node, setNode] = useState({ id: 'deck-1', typeId: 'vj.deck', values })
    const patch = (p) => { onValues?.(p); setNode((n) => ({ ...n, values: { ...n.values, ...p } })) }
    return <VjDeckView node={node} onPatchValues={editable ? patch : null} />
}

let fake
const setup = async (props = {}) => {
    fake = fakeAccess()
    vi.stubGlobal('navigator', { ...globalThis.navigator, requestMIDIAccess: () => Promise.resolve(fake.access) })
    const view = render(<Host values={{ deck: baseDeck(), ...(props.stored ? { midiMap: props.stored } : {}) }} editable={props.editable} onValues={props.onValues} />)
    if (props.editable !== false) await waitFor(() => expect(fake.input.onmidimessage).toBeTypeOf('function'))
    return view
}
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const rightClick = (el) => fireEvent.contextMenu(el, { clientX: 40, clientY: 40 })

describe('right-click menu on the deck', () => {
    it('opens on a MIDI target, with the binding in words and the three items', async () => {
        await setup()
        rightClick(screen.getByLabelText('Play column 5')) // no K2 default for column 5
        const menu = screen.getByRole('menu')
        expect(within(menu).getByText('Not mapped')).toBeTruthy()
        expect(within(menu).getByRole('menuitem', { name: 'Map to MIDI' })).toBeTruthy()
        expect(within(menu).queryByRole('menuitem', { name: 'Reset value' })).toBeNull() // a button has no start value
        expect(within(menu).queryByRole('menuitem', { name: /Remove MIDI map/ })).toBeNull()
        fireEvent.keyDown(document.body, { key: 'Escape' })
        await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
        rightClick(screen.getByLabelText('Master')) // a slider: Reset value too
        expect(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Reset value' })).toBeTruthy()
    })

    it('Map to MIDI: learn is on with that control picked, the next message binds it, learn ends', async () => {
        const onValues = vi.fn()
        await setup({ onValues })
        rightClick(screen.getByLabelText('Master'))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Map to MIDI' }))
        expect(screen.queryByRole('menu')).toBeNull()
        expect(screen.getByRole('button', { name: 'MIDI' }).getAttribute('aria-pressed')).toBe('true')
        expect(document.querySelector('.vj-deck-midi-state').textContent).toContain('master')
        expect(document.querySelector('.vj-deck-mapbox.is-picked').getAttribute('data-map-key')).toBe('master')
        act(() => fake.input.onmidimessage({ data: [0xbe, 12, 64] }))
        expect(onValues).toHaveBeenCalledWith({ midiMap: { bindings: [expect.objectContaining({ action: 'master', match: { kind: 'cc', number: 12, channel: 15 } })] } })
        await waitFor(() => expect(screen.getByRole('button', { name: 'MIDI' }).getAttribute('aria-pressed')).toBe('false'))
        expect(document.querySelector('.vj-deck-mapmode')).toBeNull()
    })

    it('shows the learned binding and Remove MIDI map takes it away', async () => {
        const onValues = vi.fn()
        const stored = { bindings: [{ match: { kind: 'cc', number: 12, channel: 15 }, action: 'master', args: {} }] }
        await setup({ stored, onValues })
        rightClick(screen.getByLabelText('Master'))
        expect(within(screen.getByRole('menu')).getByText('CC 12 · ch 15')).toBeTruthy()
        fireEvent.click(screen.getByRole('menuitem', { name: 'Remove MIDI map' }))
        expect(onValues).toHaveBeenCalledWith({ midiMap: { bindings: [] } })
        expect(screen.queryByRole('menu')).toBeNull()
    })

    it('a K2 default binding shows, and Remove is disabled with "K2 default"', async () => {
        await setup()
        rightClick(screen.getByRole('button', { name: 'Tap' })) // encoder 5 push = tap tempo
        const menu = screen.getByRole('menu')
        expect(within(menu).getByText(/^Note \d+ · ch 15$/)).toBeTruthy()
        const remove = within(menu).getByRole('menuitem', { name: /Remove MIDI map/ })
        expect(remove.getAttribute('aria-disabled')).toBe('true')
        expect(remove.textContent).toContain('K2 default')
        expect(within(menu).queryByRole('menuitem', { name: 'Reset value' })).toBeNull()
    })

    it('Reset value puts a slider back to its start', async () => {
        await setup()
        expect(Number(screen.getByLabelText('Master').value)).toBeCloseTo(0.3)
        rightClick(screen.getByLabelText('Master'))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Reset value' }))
        await waitFor(() => expect(Number(screen.getByLabelText('Master').value)).toBe(1))
    })

    it('a clip tile has no Reset value; the browser menu stays on anything that is not a target', async () => {
        await setup()
        rightClick(screen.getByLabelText(/Layer 1, slot 1/))
        expect(within(screen.getByRole('menu')).queryByRole('menuitem', { name: 'Reset value' })).toBeNull()
        fireEvent.keyDown(document.body, { key: 'Escape' })
        await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
        const notTarget = document.querySelector('.vj-deck-midi-state')
        const allowed = fireEvent.contextMenu(notTarget)
        expect(allowed).toBe(true) // not prevented: the browser's own menu
        expect(screen.queryByRole('menu')).toBeNull()
    })

    it('a read-only deck has no menu and does not prevent the browser one', async () => {
        await setup({ editable: false })
        const allowed = fireEvent.contextMenu(screen.getByLabelText('Master'))
        expect(allowed).toBe(true)
        expect(screen.queryByRole('menu')).toBeNull()
    })

    it('keyboard: the menu key opens it on the focused control, arrows move, Enter picks, Escape closes', async () => {
        await setup()
        const master = screen.getByLabelText('Master')
        master.focus()
        fireEvent.keyDown(master, { key: 'ContextMenu' })
        expect(screen.getByRole('menu')).toBeTruthy()
        await waitFor(() => expect(document.activeElement.textContent).toBe('Map to MIDI'))
        fireEvent.keyDown(document.activeElement, { key: 'ArrowDown' })
        expect(document.activeElement.textContent).toBe('Reset value')
        fireEvent.keyDown(document.activeElement, { key: 'Escape' })
        await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
        fireEvent.keyDown(master, { key: 'F10', shiftKey: true })
        expect(screen.getByRole('menu')).toBeTruthy()
        await waitFor(() => expect(document.activeElement.textContent).toBe('Map to MIDI'))
        fireEvent.keyDown(document.activeElement, { key: 'Enter' })
        expect(screen.queryByRole('menu')).toBeNull()
        expect(screen.getByRole('button', { name: 'MIDI' }).getAttribute('aria-pressed')).toBe('true')
    })

    it('closes on a click outside', async () => {
        await setup()
        rightClick(screen.getByLabelText('Master'))
        fireEvent.pointerDown(document.body)
        expect(screen.queryByRole('menu')).toBeNull()
    })
})

describe('map mode look', () => {
    it('with the MIDI button on, every target has a tinted box, mapped ones carry their number', async () => {
        await setup({ stored: { bindings: [{ match: { kind: 'cc', number: 12, channel: 15 }, action: 'master', args: {} }] } })
        expect(document.querySelector('.vj-deck-mapmode')).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'MIDI' }))
        const targets = document.querySelectorAll('[data-midi-target]').length
        expect(targets).toBeGreaterThan(5)
        expect(document.querySelectorAll('.vj-deck-mapbox').length).toBe(targets)
        const master = document.querySelector('.vj-deck-mapbox[data-map-key="master"]')
        expect(master.classList.contains('is-mapped')).toBe(true)
        expect(master.querySelector('.vj-deck-maptag').textContent).toBe('CC 12')
        // the K2 default of tap shows too
        expect(document.querySelector('.vj-deck-mapbox[data-map-key="tap"] .vj-deck-maptag').textContent).toMatch(/^N \d+$/)
        // the overlay never takes the pointer
        expect(document.querySelector('.vj-deck-mapmode').getAttribute('aria-hidden')).toBe('true')
        // clicking a control picks it, and several can be mapped in a row (learn stays on)
        fireEvent.click(screen.getByLabelText('Master'))
        expect(document.querySelector('.vj-deck-mapbox.is-picked').getAttribute('data-map-key')).toBe('master')
        act(() => fake.input.onmidimessage({ data: [0xbe, 20, 64] }))
        expect(screen.getByRole('button', { name: 'MIDI' }).getAttribute('aria-pressed')).toBe('true')
        await waitFor(() => expect(document.querySelector('.vj-deck-mapbox[data-map-key="master"] .vj-deck-maptag').textContent).toBe('CC 20'))
    })
})
