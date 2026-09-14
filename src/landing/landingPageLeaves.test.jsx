import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { debrisLeaveState, DEBRIS_LEAVE_MS } from './PageDebris.jsx'

// The fallen page used to stay in the room for good: a dark tilted strip of
// tiny warped nav text lying across the doors. It must leave once the visitor
// is nearly there, and be dropped from the scene once it has gone.

const bgProps = vi.hoisted(() => ({ current: null }))
const texture = vi.hoisted(() => ({ dispose: null }))
vi.mock('../components/GridFloorBackground.jsx', () => ({
    default: (props) => {
        bgProps.current = props
        return <div data-testid="mock-grid-bg" />
    }
}))
vi.mock('../services/serverSpaces.js', () => ({ getServerConfig: () => Promise.resolve({}) }))
vi.mock('./enterFlight.js', async (importOriginal) => {
    const actual = await importOriginal()
    return {
        ...actual,
        flyInside: ({ onPieces, onPageLeaves, onDone }) => {
            onPieces?.([{ id: 'p1', texture: { dispose: texture.dispose } }])
            onPageLeaves?.()
            onDone?.()
            return () => {}
        }
    }
})

window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }))

import LandingPage from './LandingPage.jsx'

describe('the fallen page', () => {
    beforeEach(() => {
        bgProps.current = null
        texture.dispose = vi.fn()
    })

    it('is told to leave the room, then is dropped from the scene and its textures freed', async () => {
        render(<LandingPage />)
        fireEvent.click(screen.getAllByRole('link', { name: /Step inside/ })[0])
        await waitFor(() => expect(bgProps.current?.sceneExtras?.props?.leaving).toBe(true))

        act(() => { bgProps.current.sceneExtras.props.onGone() })
        await waitFor(() => expect(bgProps.current.sceneExtras).toBeNull())
        expect(texture.dispose).toHaveBeenCalled()
    })

    it('asks the room to frame its doors for a phone', async () => {
        render(<LandingPage />)
        await waitFor(() => expect(bgProps.current).toBeTruthy())
        expect(bgProps.current.fitArrivalToDoors).toBe(true)
    })
})

describe('debrisLeaveState', () => {
    it('fades and sinks from whole to gone', () => {
        expect(debrisLeaveState(0)).toEqual({ opacity: 1, sink: 0, done: false })
        const mid = debrisLeaveState(DEBRIS_LEAVE_MS / 2)
        expect(mid.opacity).toBeCloseTo(0.5)
        expect(mid.sink).toBeGreaterThan(0)
        expect(debrisLeaveState(DEBRIS_LEAVE_MS).done).toBe(true)
        expect(debrisLeaveState(DEBRIS_LEAVE_MS * 3).opacity).toBe(0)
    })
})
