import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../components/GridFloorBackground.jsx', () => ({ default: () => <div data-testid="mock-grid-bg" /> }))
vi.mock('../services/serverSpaces.js', () => ({ getServerConfig: () => Promise.resolve({}) }))

const sessionState = { authenticated: false, type: null }
vi.mock('../hooks/useAuthSession.js', () => ({ default: () => ({ ...sessionState }) }))

window.matchMedia = window.matchMedia || (() => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {}
}))

import LandingPage from './LandingPage.jsx'

// Regression test: "Try Beta"/"Open Studio" must not land guests on the
// restricted 'main' space, where AuthGate's out-of-scope-but-public redirect
// silently bounces them to the read-only live viewer instead of the editor
// they clicked for (see docs/ai/known-fixes.md, 2026-07-17).
describe('LandingPage CTA routing', () => {
    it('points every Beta link at the open sandbox space, not the bare /beta route', () => {
        render(<LandingPage />)
        const betaLinks = screen.getAllByRole('link', { name: 'Beta' })
        expect(betaLinks.length).toBeGreaterThan(0)
        for (const link of betaLinks) {
            expect(link.getAttribute('href')).toBe('/open/beta')
        }
    })

    it('points Studio/"Open Studio" links at the browsable open-space hub for guests, not the jam-forwarding door', () => {
        Object.assign(sessionState, { authenticated: false, type: null })
        render(<LandingPage />)
        const studioLinks = [
            ...screen.getAllByRole('link', { name: 'Studio' }),
            ...screen.getAllByRole('link', { name: 'Open Studio' })
        ]
        expect(studioLinks.length).toBeGreaterThan(0)
        for (const link of studioLinks) {
            expect(link.getAttribute('href')).toBe('/open/studio?browse=1')
        }
    })

    it('sends signed-in (non-guest) sessions to their own Spaces hub, but keeps guest sessions on the sandbox', () => {
        Object.assign(sessionState, { authenticated: true, type: 'user' })
        const { unmount } = render(<LandingPage />)
        for (const link of screen.getAllByRole('link', { name: 'Open Studio' })) {
            expect(link.getAttribute('href')).toBe('/studio')
        }
        unmount()

        Object.assign(sessionState, { authenticated: true, type: 'guest' })
        render(<LandingPage />)
        for (const link of screen.getAllByRole('link', { name: 'Open Studio' })) {
            expect(link.getAttribute('href')).toBe('/open/studio?browse=1')
        }
    })

    it('keeps "Step inside" pointing at the plain open-space door (jam forward stays active)', () => {
        Object.assign(sessionState, { authenticated: true, type: 'user' })
        render(<LandingPage />)
        const doors = screen.getAllByRole('link', { name: 'Step inside' })
        expect(doors.length).toBeGreaterThan(0)
        for (const link of doors) {
            expect(link.getAttribute('href')).toBe('/open/studio')
        }
    })
})
