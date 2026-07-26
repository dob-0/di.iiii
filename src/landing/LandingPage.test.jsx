import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../components/GridFloorBackground.jsx', () => ({ default: () => <div data-testid="mock-grid-bg" /> }))
vi.mock('../services/serverSpaces.js', () => ({ getServerConfig: () => Promise.resolve({}) }))

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

    it('points every Studio/"Open Studio" link at the browsable open-space hub, not the jam-forwarding door', () => {
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

    it('keeps "Step inside" pointing at the plain open-space door (jam forward stays active)', () => {
        render(<LandingPage />)
        const doors = screen.getAllByRole('link', { name: 'Step inside' })
        expect(doors.length).toBeGreaterThan(0)
        for (const link of doors) {
            expect(link.getAttribute('href')).toBe('/open/studio')
        }
    })
})
