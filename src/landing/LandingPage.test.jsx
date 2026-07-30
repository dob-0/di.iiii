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
    it('points every Raw link at the open sandbox space, not the bare /raw route', () => {
        // Bare lane routes default to the restricted 'main' space, where a guest
        // has no write scope and gets bounced to the read-only viewer.
        render(<LandingPage />)
        const rawLinks = screen.getAllByRole('link', { name: 'Raw v.0' })
        expect(rawLinks.length).toBeGreaterThan(0)
        for (const link of rawLinks) {
            expect(link.getAttribute('href')).toBe('/open/raw')
        }
    })

    it('points every Studio link at the spaces hub, not one space\'s project list', () => {
        // Regression: these used to go to /open/studio?browse=1, which is
        // StudioHub — the *open space's project list*, one level below the
        // top. The label promises the hub; deliver the hub.
        Object.assign(sessionState, { authenticated: false, type: null })
        render(<LandingPage />)
        const studioLinks = [
            ...screen.getAllByRole('link', { name: 'Studio' }),
            ...screen.getAllByRole('link', { name: 'Open Studio' })
        ]
        expect(studioLinks.length).toBeGreaterThan(0)
        for (const link of studioLinks) {
            expect(link.getAttribute('href')).toBe('/studio')
        }
    })

    it('uses the same destination for every session state', () => {
        // Branching on the session also meant these static hrefs pointed at the
        // guest destination during the tick before the session resolved — an
        // owner clicking fast enough was sent somewhere else entirely.
        for (const session of [
            { authenticated: false, type: null },
            { authenticated: true, type: 'guest' },
            { authenticated: true, type: 'user' }
        ]) {
            Object.assign(sessionState, session)
            const { unmount } = render(<LandingPage />)
            for (const link of screen.getAllByRole('link', { name: 'Open Studio' })) {
                expect(link.getAttribute('href')).toBe('/studio')
            }
            unmount()
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
