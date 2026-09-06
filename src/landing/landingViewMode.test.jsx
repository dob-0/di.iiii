import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The room, reduced to the props the page hands it. What broke view mode was
// never visible in the DOM: the page passed `interactive={entered && !viewMode}`,
// so pressing "View mode" turned the room into the decorative, click-through
// background and every drag went nowhere. The props ARE the behaviour here.
const bgProps = vi.hoisted(() => ({ current: null }))
vi.mock('../components/GridFloorBackground.jsx', () => ({
    default: (props) => {
        bgProps.current = props
        return <div data-testid="mock-grid-bg" />
    }
}))

vi.mock('../services/serverSpaces.js', () => ({ getServerConfig: () => Promise.resolve({}) }))
vi.mock('../hooks/useAuthSession.js', () => ({ default: () => ({ authenticated: false, type: null }) }))
vi.mock('../services/apiClient.js', () => ({
    getApiSession: vi.fn(() => Promise.resolve({ sandboxSpaceId: 'sandbox-guestabc', type: 'guest' }))
}))

// The flight is 2.2s of motion no test can judge; this file is about what the
// room is handed once it has landed, so land it at once.
vi.mock('./enterFlight.js', async (importOriginal) => {
    const actual = await importOriginal()
    return { ...actual, flyInside: ({ onDone }) => { onDone?.(); return () => {} } }
})

window.matchMedia = window.matchMedia || (() => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {}
}))

import LandingPage from './LandingPage.jsx'

const stepInside = async () => {
    render(<LandingPage />)
    fireEvent.click(screen.getAllByRole('link', { name: /Step inside/ })[0])
    await waitFor(() => expect(screen.getByRole('button', { name: /View mode/ })).toBeTruthy())
}

describe('the front door\'s view mode', () => {
    beforeEach(() => { bgProps.current = null })

    it('hands the room an orbit, not a switched-off scene', async () => {
        await stepInside()
        expect(bgProps.current.interactive).toBe(true)
        expect(bgProps.current.orbit).toBe(false)

        fireEvent.click(screen.getByRole('button', { name: /View mode/ }))
        await waitFor(() => expect(bgProps.current.orbit).toBe(true))
        // The regression: `interactive` must NOT fall with the mode. A room
        // that is not interactive takes no pointer events at all.
        expect(bgProps.current.interactive).toBe(true)
    })

    it('goes back to walking without leaving the room', async () => {
        await stepInside()
        fireEvent.click(screen.getByRole('button', { name: /View mode/ }))
        await waitFor(() => expect(bgProps.current.orbit).toBe(true))

        fireEvent.click(screen.getByRole('button', { name: /Walk \/ fly/ }))
        await waitFor(() => expect(bgProps.current.orbit).toBe(false))
        expect(bgProps.current.interactive).toBe(true)
    })

    it('says what actually works in each mode', async () => {
        await stepInside()
        expect(screen.getByText(/Walk \(WASD\)/)).toBeTruthy()

        fireEvent.click(screen.getByRole('button', { name: /View mode/ }))
        await waitFor(() => expect(screen.getByText(/Drag to orbit/)).toBeTruthy())
        expect(screen.getByText(/Scroll to zoom/)).toBeTruthy()
        expect(screen.getByText(/Click a door/)).toBeTruthy()
        expect(screen.queryByText(/Walk \(WASD\)/)).toBeNull()
    })
})
