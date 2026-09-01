import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../components/GridFloorBackground.jsx', () => ({ default: () => <div data-testid="mock-grid-bg" /> }))
const serverConfigState = vi.hoisted(() => ({ current: {} }))
vi.mock('../services/serverSpaces.js', () => ({ getServerConfig: () => Promise.resolve(serverConfigState.current) }))

const sessionState = { authenticated: false, type: null }
vi.mock('../hooks/useAuthSession.js', () => ({ default: () => ({ ...sessionState }) }))

// The door resolves the visitor's own space on CLICK — mocked so this file can
// assert the page never asks for a session on a passive view.
const getApiSession = vi.hoisted(() => vi.fn(() => Promise.resolve({ sandboxSpaceId: 'sandbox-guestabc', type: 'guest' })))
vi.mock('../services/apiClient.js', () => ({ getApiSession }))

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
// Matched by destination, not by label: the labels are copy and have already
// been rewritten twice ("Try Beta" → "Open Studio" → the one-door pass), while
// the trap these guard against lives in the href.
const internalLinksTo = (fragment) => screen.getAllByRole('link').filter((link) => {
    const href = link.getAttribute('href') || ''
    return href.startsWith('/') && href.includes(fragment)
})

describe('LandingPage CTA routing', () => {
    it('sends no door at the browser-local node canvas', () => {
        // The canvas at /{space}/raw lives in the browser's own storage: it
        // cannot save into a space and cannot publish, so nothing made there
        // survives or can be handed to anyone. The front page must not open
        // onto it. (Bare /raw is worse still — it defaults to the restricted
        // 'main' space, where a guest is bounced to the read-only viewer.)
        render(<LandingPage />)
        expect(internalLinksTo('/raw')).toHaveLength(0)
    })

    it('points every Studio link at the spaces hub, not one space\'s project list', () => {
        // Regression: these used to go to /open/studio?browse=1, which is
        // StudioHub — the *open space's project list*, one level below the
        // top. The label promises the hub; deliver the hub.
        Object.assign(sessionState, { authenticated: false, type: null })
        render(<LandingPage />)
        const spacesLinks = screen.getAllByRole('link', { name: /Open Studio/ })
        expect(spacesLinks.length).toBeGreaterThan(0)
        for (const link of spacesLinks) {
            expect(link.getAttribute('href')).toBe('/spaces')
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
            for (const link of screen.getAllByRole('link', { name: /Open Studio/ })) {
                expect(link.getAttribute('href')).toBe('/spaces')
            }
            unmount()
        }
    })

    it('flies into the room on click instead of navigating, and asks for nothing either way', () => {
        // The door is a camera move now, not a destination: the room is
        // already on screen behind this page, so pressing it must not leave.
        // It also must not ask for a session — GET /api/auth/session mints a
        // guest one for whoever asks, and this page no longer has any reason
        // to. The href stays a real destination for no-JS, middle-click and
        // crawlers, which is why it is still a link and not a button.
        getApiSession.mockClear()
        Object.assign(sessionState, { authenticated: true, type: 'user' })
        render(<LandingPage />)
        expect(getApiSession).not.toHaveBeenCalled()

        const doors = screen.getAllByRole('link', { name: 'Step inside' })
        expect(doors.length).toBeGreaterThan(0)
        for (const link of doors) {
            expect(link.getAttribute('href')).toBe('/spaces')
        }

        const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
        doors[0].dispatchEvent(event)
        expect(event.defaultPrevented).toBe(true)
        expect(getApiSession).not.toHaveBeenCalled()
    })

    it('lets a modified click stay a link, so a new tab still opens the destination', () => {
        // Cmd/Ctrl/Shift-click and the middle button belong to the browser.
        // Swallowing them would make the one control on the page that looks
        // like a link the one that cannot be opened in a tab.
        Object.assign(sessionState, { authenticated: false, type: null })
        render(<LandingPage />)
        const door = screen.getAllByRole('link', { name: 'Step inside' })[0]
        for (const modifier of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { button: 1 }]) {
            const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...modifier })
            door.dispatchEvent(event)
            expect(event.defaultPrevented).toBe(false)
        }
    })
})

// The one-door pass (2026-08-18): the hero used to offer three peer buttons,
// two of which led somewhere worse than the first — "Open Studio" to a hub
// that wants an account, "Enter Space" to the restricted 'main' space and its
// read-only bounce. Studio is depth behind the door now, not a rival to it.
describe('LandingPage one door', () => {
    afterEach(() => {
        serverConfigState.current = {}
    })

    it('offers exactly one primary entrance, and no second button beside it', async () => {
        serverConfigState.current = { defaultSpaceId: 'main', local: false, requireAuth: true }
        render(<LandingPage />)

        // The server's main space resolves asynchronously; "Look around" is
        // only ever rendered while there is no main space to enter.
        // Both the hero and the closing section carry it — findBy* would keep
        // retrying on "multiple elements" until it timed out.
        await screen.findAllByText(/Already have spaces\?/)
        expect(screen.queryByRole('button', { name: 'Enter Space' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Look around' })).not.toBeInTheDocument()
        const returnPath = screen.getAllByRole('link', { name: /Open Studio/ })
        expect(returnPath.length).toBeGreaterThan(0)
        for (const link of returnPath) expect(link.getAttribute('href')).toBe('/spaces')
    })

    it('keeps the walkable void reachable where there is no main space', async () => {
        serverConfigState.current = { defaultSpaceId: null, local: false, requireAuth: true }
        render(<LandingPage />)

        expect(await screen.findByRole('button', { name: 'Look around' })).toBeInTheDocument()
    })
})

// A `di up` install has no accounts and no quota; the server says so via
// /api/config (local + requireAuth). The landing must stop speaking hosted
// copy there — and must NOT switch on `local` alone: local with auth on is a
// deliberate setup that keeps the hosted sentences.
describe('LandingPage local-install copy', () => {
    afterEach(() => {
        serverConfigState.current = {}
    })

    it('swaps hosted sign-in copy for local truth when local && !requireAuth', async () => {
        serverConfigState.current = { local: true, requireAuth: false }
        render(<LandingPage />)

        expect(await screen.findByText(/everything here is yours to edit/)).toBeInTheDocument()
        expect(screen.getByText('Your machine, your spaces')).toBeInTheDocument()
        expect(screen.queryByText(/Sign in to keep it/)).not.toBeInTheDocument()
        expect(screen.queryByText('3 free spaces')).not.toBeInTheDocument()
    })

    it('keeps hosted copy on the hosted product', async () => {
        serverConfigState.current = { local: false, requireAuth: true }
        render(<LandingPage />)

        expect(await screen.findByText(/Sign in to keep it/)).toBeInTheDocument()
        expect(screen.getByText('3 free spaces')).toBeInTheDocument()
        expect(screen.queryByText('Your machine, your spaces')).not.toBeInTheDocument()
    })

    it('keeps hosted copy when a local install deliberately turns auth on', async () => {
        serverConfigState.current = { local: true, requireAuth: true }
        render(<LandingPage />)

        expect(await screen.findByText(/Sign in to keep it/)).toBeInTheDocument()
        expect(screen.queryByText('Your machine, your spaces')).not.toBeInTheDocument()
    })
})
