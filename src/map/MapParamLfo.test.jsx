import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, within } from '@testing-library/react'
import { useState } from 'react'
import { ParamRow } from './MapDeskDock.jsx'

// The "~" after a setting (2026-11-11): it opens the LFO strip under the row.

const spec = { key: 'amount', label: 'Amount', kind: 'number', min: 0, max: 1, step: 0.01, default: 0.5 }

function Row({ start, onLfoSpy, rowSpec = spec }) {
    const [lfo, setLfo] = useState(start)
    return (
        <ParamRow spec={rowSpec} value={0.5} onChange={() => {}} lfo={lfo}
            onLfo={(next) => { onLfoSpy?.(next); setLfo(next) }} />
    )
}

describe('ParamRow — LFO', () => {
    it('no ~ when the row takes no LFO (the Mapping window’s rows)', () => {
        const { queryByRole } = render(<ParamRow spec={spec} value={0.5} onChange={() => {}} />)
        expect(queryByRole('button', { name: 'Amount LFO' })).toBeNull()
    })

    it('no ~ on a speed, but its place is kept so the ↺ column lines up', () => {
        const { queryByRole, container } = render(<Row rowSpec={{ ...spec, rate: true }} />)
        expect(queryByRole('button', { name: 'Amount LFO' })).toBeNull()
        expect(container.querySelector('.map-param.has-lfo .map-param-lfo-none')).toBeTruthy()
    })

    it('the first ~ starts it swinging (sine, a bar, half) and opens the strip', () => {
        const spy = vi.fn()
        const { getByRole, container } = render(<Row onLfoSpy={spy} />)
        fireEvent.click(getByRole('button', { name: 'Amount LFO' }))
        expect(spy).toHaveBeenLastCalledWith({ on: true, wave: 'sine', beats: 4, depth: 0.5 })
        const strip = getByRole('group', { name: 'Amount LFO' })
        expect(within(strip).getByRole('switch', { name: 'Amount LFO on' }).getAttribute('aria-checked')).toBe('true')
        expect(container.querySelector('.map-param-lfo-mark')).toBeTruthy()
        expect(container.querySelector('.map-param-swing')).toBeTruthy()
    })

    it('wave, length and depth change it; Off keeps the settings', () => {
        const spy = vi.fn()
        const { getByRole } = render(<Row start={{ on: true, wave: 'sine', beats: 4, depth: 0.5 }} onLfoSpy={spy} />)
        fireEvent.click(getByRole('button', { name: 'Amount LFO' }))
        const strip = getByRole('group', { name: 'Amount LFO' })
        fireEvent.click(within(strip).getByRole('radio', { name: 'Square' }))
        expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ wave: 'square', on: true }))
        fireEvent.change(within(strip).getByLabelText('Every'), { target: { value: '0.5' } })
        expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ beats: 0.5 }))
        const depth = within(strip).getByLabelText('Depth value')
        fireEvent.focus(depth)
        fireEvent.change(depth, { target: { value: '80' } })
        fireEvent.blur(depth)
        expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ depth: 0.8 }))
        fireEvent.click(within(strip).getByRole('switch', { name: 'Amount LFO on' }))
        expect(spy).toHaveBeenLastCalledWith({ on: false, wave: 'square', beats: 0.5, depth: 0.8 })
    })

    it('opening it again does not overwrite a stored LFO', () => {
        const spy = vi.fn()
        const { getByRole } = render(<Row start={{ on: false, wave: 'tri', beats: 8, depth: 0.3 }} onLfoSpy={spy} />)
        fireEvent.click(getByRole('button', { name: 'Amount LFO' }))
        expect(spy).not.toHaveBeenCalled()
        expect(within(getByRole('group', { name: 'Amount LFO' })).getByRole('radio', { name: 'Triangle' }).getAttribute('aria-checked')).toBe('true')
    })
})
