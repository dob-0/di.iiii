import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const sceneProps = vi.hoisted(() => ({ current: null }))
vi.mock('./LiveProjectScene.jsx', () => ({
    default: (props) => {
        sceneProps.current = props
        return <div data-testid="mock-live-scene" />
    }
}))
vi.mock('../services/serverSpaces.js', () => ({ listServerSpaces: () => Promise.resolve([]) }))

// The component skips the scene entirely where there is no ResizeObserver —
// its own "am I in a test" check. Give it one, because the scene's props are
// exactly what this file is about.
window.ResizeObserver = window.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} }

import GridFloorBackground from './GridFloorBackground.jsx'

describe('GridFloorBackground', () => {
    it('passes the orbit mode through to the scene', async () => {
        render(<GridFloorBackground interactive orbit />)
        await waitFor(() => expect(sceneProps.current).toBeTruthy())
        expect(sceneProps.current.interactive).toBe(true)
        expect(sceneProps.current.orbit).toBe(true)
    })

    it('walks by default, and stays click-through when not interactive', async () => {
        const { container } = render(<GridFloorBackground />)
        await waitFor(() => expect(sceneProps.current).toBeTruthy())
        expect(sceneProps.current.orbit).toBe(false)
        expect(container.querySelector('.grid-floor-background').style.pointerEvents).toBe('none')
    })

    it('takes pointer events in view mode — the whole point of it', async () => {
        const { container } = render(<GridFloorBackground interactive orbit />)
        await waitFor(() => expect(screen.getAllByTestId('mock-live-scene').length).toBeGreaterThan(0))
        expect(container.querySelector('.grid-floor-background').style.pointerEvents).toBe('auto')
    })
})
