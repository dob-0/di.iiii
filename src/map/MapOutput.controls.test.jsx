import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MapOutputControls } from './MapOutput.jsx'

vi.mock('./MapStage.jsx', () => ({ default: () => null }))
vi.mock('./useMapDocument.js', () => ({ useMapDocument: () => ({}), useMapChannelListener: () => {} }))
vi.mock('../project/tops/useTopNetwork.js', () => ({ toTopNetwork: () => ({ nodes: [], wires: [] }), useTopNetwork: () => ({}) }))
vi.mock('../project/tops/useMachinePresence.js', () => ({ useMachinePresence: () => ({}) }))
vi.mock('../rig/RigBlackout.jsx', () => ({ default: () => null }))

afterEach(() => { Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true }) })

describe('the output page controls', () => {
    it('offers the way back to Perform when not full screen, and goes there', () => {
        const assign = vi.fn()
        const original = window.location
        Object.defineProperty(window, 'location', { value: { ...original, assign }, configurable: true })
        render(<MapOutputControls spaceId="main" projectId="p1" />)
        fireEvent.click(screen.getByText('Back to Perform'))
        expect(assign).toHaveBeenCalledTimes(1)
        expect(assign.mock.calls[0][0]).toMatch(/\/main\/perform\/p1/)
        Object.defineProperty(window, 'location', { value: original, configurable: true })
    })

    it('draws no link in full screen', () => {
        Object.defineProperty(document, 'fullscreenElement', { value: document.documentElement, configurable: true })
        render(<MapOutputControls spaceId="main" projectId="p1" />)
        expect(screen.queryByText('Back to Perform')).toBeNull()
        expect(screen.getByText('Exit full screen')).toBeTruthy()
    })
})
