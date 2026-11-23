import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import { _hearStateForTest, engineAutopilot, resetDeskBeat, setEngineAutopilot, ENGINE_URL } from './deskBeat.js'
import { MapAutopilot } from './MapDeskDock.jsx'

// Emily, 11-12: "a loop button like autopilot: on, the patterns change; off,
// no loop". The desk shows and sets the bar show engine's own autopilot
// (state.auto), the same switch as the pad's "Autopilot on/off".
describe('the desk Autopilot switch', () => {
    afterEach(() => { resetDeskBeat() })

    it('is not there until the engine has said whether its autopilot is on', () => {
        const { queryByRole } = render(<MapAutopilot />)
        expect(engineAutopilot()).toBeNull()
        expect(queryByRole('switch', { name: 'Autopilot' })).toBeNull()
    })

    it('shows the engine’s autopilot and follows it when the pad changes it', () => {
        const { getByRole } = render(<MapAutopilot />)
        act(() => { _hearStateForTest({ auto: true }) })
        expect(getByRole('switch', { name: 'Autopilot' }).getAttribute('aria-checked')).toBe('true')
        act(() => { _hearStateForTest({ auto: false }) })
        expect(getByRole('switch', { name: 'Autopilot' }).getAttribute('aria-checked')).toBe('false')
    })

    it('a click sends {auto} to the engine the way the pad does', async () => {
        const fetchImpl = vi.fn(() => Promise.resolve({ ok: true }))
        vi.stubGlobal('fetch', fetchImpl)
        const { getByRole } = render(<MapAutopilot />)
        act(() => { _hearStateForTest({ auto: true }) })
        await act(async () => { fireEvent.click(getByRole('switch', { name: 'Autopilot' })) })
        expect(fetchImpl).toHaveBeenCalledWith(`${ENGINE_URL}/api/set`, expect.objectContaining({ method: 'POST' }))
        expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ patch: { auto: false } })
        expect(fetchImpl.mock.calls[0][1].headers['X-Bar']).toBe('pad')
        expect(getByRole('switch', { name: 'Autopilot' }).getAttribute('aria-checked')).toBe('false')
        vi.unstubAllGlobals()
    })

    it('a refused switch puts the button back', async () => {
        _hearStateForTest({ auto: true })
        const ok = await setEngineAutopilot(false, { fetchImpl: () => Promise.reject(new Error('engine gone')) })
        expect(ok).toBe(false)
        expect(engineAutopilot()).toBe(true)
    })
})

describe('Autopilot in the Mapping window too', () => {
    afterEach(() => { resetDeskBeat() })
    it('takes the window’s own button style and stays the same switch', () => {
        const { getByRole } = render(<MapAutopilot className="map-mo-btn" />)
        act(() => { _hearStateForTest({ auto: true }) })
        const button = getByRole('switch', { name: 'Autopilot' })
        expect(button.className).toMatch(/map-mo-btn/)
        expect(button.className).toMatch(/is-on/)
    })
})
