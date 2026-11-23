import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import VjDeckView from './VjDeckView.jsx'
import { createDeck, setClip, trigger } from '../../../project/tops/vjDeck.js'

// Deselect, Preview only + TAKE, and the monitor size (PROGRESS.md (the feat-deck-preview-take entry)).
const assets = [{ id: 'asset-rain', name: 'rain.webm', mimeType: 'video/webm' }]
const clip = (asset) => ({ id: `c-${asset}`, kind: 'asset', asset, label: asset })

function Host({ initialDeck, onValues = () => {} }) {
    const [node, setNode] = useState({ id: 'deck-1', typeId: 'vj.deck', values: { machine: '', deck: initialDeck } })
    return (
        <div>
            <input aria-label="outside field" />
            <VjDeckView node={node} assets={assets} onPatchValues={(patch) => setNode((c) => { const next = { ...c, values: { ...c.values, ...patch } }; onValues(next.values); return next })} />
        </div>
    )
}
const last = (spy) => spy.mock.calls.at(-1)[0].deck
const slot = (layer, column) => screen.getByRole('button', { name: new RegExp(`^Layer ${layer}, slot ${column}:`) })
const base = () => trigger(setClip(setClip(createDeck(), 0, 0, clip('a')), 0, 2, clip('b')), 0, 0)
const previewPane = () => document.querySelector('.vj-deck-monitor--preview')

beforeEach(() => { try { window.localStorage.clear() } catch { /* none */ } })
afterEach(cleanup)

describe('deselect', () => {
    it('a click on the tile that is already playing stops its layer', () => {
        const onValues = vi.fn()
        render(<Host initialDeck={base()} onValues={onValues} />)
        expect(slot(1, 1).getAttribute('aria-pressed')).toBe('true')
        fireEvent.click(slot(1, 1))
        expect(last(onValues).layers[0].active).toBe(-1)
        fireEvent.click(slot(1, 3))
        expect(last(onValues).layers[0].active).toBe(2)
    })

    it('Esc clears the selection: Preview and Clip go back to empty', () => {
        render(<Host initialDeck={base()} />)
        fireEvent.click(slot(1, 3))
        expect(screen.getByRole('region', { name: 'Clip settings' })).toBeTruthy()
        const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
        act(() => { document.body.dispatchEvent(esc) })
        expect(esc.defaultPrevented).toBe(true)
        expect(within(previewPane()).getByText('Select a clip')).toBeTruthy()
        expect(within(screen.getByRole('region', { name: 'Clip' })).getByText('Select a clip')).toBeTruthy()
    })

    it('Esc with nothing selected is left alone, so the Perform window key still runs', () => {
        render(<Host initialDeck={base()} />)
        const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
        document.body.dispatchEvent(esc)
        expect(esc.defaultPrevented).toBe(false)
    })

    it('Esc inside a field or with a menu open is ignored', () => {
        render(<Host initialDeck={base()} />)
        fireEvent.click(slot(1, 3))
        fireEvent.keyDown(screen.getAllByRole('combobox')[0], { key: 'Escape' })
        expect(slot(1, 3).className).toContain('is-selected')
        fireEvent.keyDown(screen.getByLabelText('outside field'), { key: 'Escape' })
        expect(slot(1, 3).className).toContain('is-selected')
        const menu = document.createElement('div')
        menu.setAttribute('role', 'menu')
        document.body.appendChild(menu)
        act(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })) })
        expect(slot(1, 3).className).toContain('is-selected')
        menu.remove()
    })

    it('a click on the empty grid background clears the selection', () => {
        render(<Host initialDeck={base()} />)
        fireEvent.click(slot(1, 3))
        fireEvent.click(document.querySelector('.vj-deck-scroll'))
        expect(slot(1, 3).className).not.toContain('is-selected')
        expect(within(previewPane()).getByText('Select a clip')).toBeTruthy()
    })
})

describe('Preview only and TAKE', () => {
    it('off by default: a click goes live', () => {
        const onValues = vi.fn()
        render(<Host initialDeck={base()} onValues={onValues} />)
        expect(screen.getByRole('button', { name: /Preview only/ }).getAttribute('aria-pressed')).toBe('false')
        expect(screen.queryByRole('button', { name: 'Take' })).toBeNull()
        fireEvent.click(slot(1, 3))
        expect(last(onValues).layers[0].active).toBe(2)
    })

    it('on: a click only selects; TAKE and Enter send it live', () => {
        const onValues = vi.fn()
        render(<Host initialDeck={base()} onValues={onValues} />)
        fireEvent.click(screen.getByRole('button', { name: /Preview only/ }))
        expect(screen.getByRole('button', { name: /Preview only/ }).getAttribute('aria-pressed')).toBe('true')
        fireEvent.click(slot(1, 3))
        expect(onValues).not.toHaveBeenCalled()
        expect(slot(1, 3).className).toContain('is-selected')
        fireEvent.click(screen.getByRole('button', { name: 'Take' }))
        expect(last(onValues).layers[0].active).toBe(2)

        fireEvent.click(slot(1, 1))
        expect(onValues).toHaveBeenCalledTimes(1)
        const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
        act(() => { document.body.dispatchEvent(enter) })
        expect(enter.defaultPrevented).toBe(true)
        expect(last(onValues).layers[0].active).toBe(0)
    })

    it('Enter in a field does not take; Take is disabled with nothing selected', () => {
        const onValues = vi.fn()
        render(<Host initialDeck={base()} onValues={onValues} />)
        fireEvent.click(screen.getByRole('button', { name: /Preview only/ }))
        expect(screen.getByRole('button', { name: 'Take' }).disabled).toBe(true)
        fireEvent.click(slot(1, 3))
        fireEvent.keyDown(screen.getByLabelText('outside field'), { key: 'Enter' })
        expect(onValues).not.toHaveBeenCalled()
    })

    it('Enter with Preview only off does nothing', () => {
        const onValues = vi.fn()
        render(<Host initialDeck={base()} onValues={onValues} />)
        fireEvent.click(slot(1, 3))
        const count = onValues.mock.calls.length
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
        expect(onValues).toHaveBeenCalledTimes(count)
    })
})

describe('monitor size', () => {
    it('S / M / L set the size, remembered on this device; default L', () => {
        const { unmount } = render(<Host initialDeck={base()} />)
        const deck = () => document.querySelector('.vj-deck')
        expect(deck().getAttribute('data-monitor-size')).toBe('l')
        fireEvent.click(screen.getByRole('button', { name: 'Monitor size S' }))
        expect(deck().getAttribute('data-monitor-size')).toBe('s')
        expect(screen.getByRole('button', { name: 'Monitor size S' }).getAttribute('aria-pressed')).toBe('true')
        unmount()
        render(<Host initialDeck={base()} />)
        expect(deck().getAttribute('data-monitor-size')).toBe('s')
    })

    it('Hide preview removes the Preview pane and keeps Output; Show brings it back', () => {
        render(<Host initialDeck={base()} />)
        fireEvent.click(screen.getByRole('button', { name: 'Hide Preview' }))
        expect(previewPane()).toBeNull()
        expect(document.querySelector('.vj-deck-monitor--output')).toBeTruthy()
        fireEvent.click(screen.getByRole('button', { name: 'Show Preview' }))
        expect(previewPane()).toBeTruthy()
    })

    it('with Preview hidden in Preview only, Take stays reachable', () => {
        render(<Host initialDeck={base()} />)
        fireEvent.click(screen.getByRole('button', { name: /Preview only/ }))
        fireEvent.click(screen.getByRole('button', { name: 'Hide Preview' }))
        expect(screen.getByRole('button', { name: 'Take' })).toBeTruthy()
    })

    it('blocked storage does not break the deck', () => {
        const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
        render(<Host initialDeck={base()} />)
        expect(document.querySelector('.vj-deck').getAttribute('data-monitor-size')).toBe('l')
        spy.mockRestore()
    })
})
