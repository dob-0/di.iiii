import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Every route off the front page other than Step inside is a real page change.
// Each one used to cut: the featured exhibitions held ~1 s of black before the
// space appeared, Open Jam reloaded the whole site, and The Spaces played a
// crack of flying shards first (owner, 2026-09-14: "too cracky and DIY").
// They now all go through the one entering move, holding the page on screen.

const entered = vi.hoisted(() => ({ calls: [] }))
vi.mock('../components/entryTransition/entryTransition.js', () => ({
    enterFromElement: (event, href, options) => {
        event?.preventDefault?.()
        entered.calls.push({ href, options })
        return true
    }
}))
vi.mock('../components/GridFloorBackground.jsx', () => ({ default: () => <div data-testid="mock-grid-bg" /> }))
vi.mock('../services/serverSpaces.js', () => ({ getServerConfig: () => Promise.resolve({}) }))

window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }))

import LandingPage from './LandingPage.jsx'

const pressed = (name) => {
    const link = screen.getAllByRole('link', { name })[0]
    fireEvent.click(link)
    return entered.calls.at(-1)
}

describe('the front page routes', () => {
    beforeEach(() => {
        entered.calls = []
        document.body.innerHTML = ''
    })

    it.each([
        ['WCC Exhibition', /^WCC Exhibition$/],
        ['br_id_ge', /^br_id_ge$/],
        ['Beyond Form', /^Beyond Form$/],
        ['algovrithm', /^algovrithm$/]
    ])('a featured exhibition (%s) goes through the entering move, holding the page', async (_label, name) => {
        render(<LandingPage />)
        await waitFor(() => expect(screen.getAllByRole('link', { name }).length).toBeGreaterThan(0))
        const call = pressed(name)
        expect(call.href).toMatch(/^\//)
        expect(call.options).toEqual({ holdPage: true })
    })

    it('The Spaces goes through the entering move, and nothing cracks', () => {
        render(<LandingPage />)
        const call = pressed(/^The Spaces$/)
        expect(call.href).toMatch(/spaces|studio/)
        expect(call.options).toEqual({ holdPage: true })
        expect(document.querySelector('.lp-crack-overlay, .lp-crack-shard')).toBeNull()
    })

    it('Open Space goes through the entering move instead of reloading the site', () => {
        render(<LandingPage />)
        const call = pressed(/^Open Space$/)
        expect(call.href).toMatch(/open_jam\/scene$/)
        expect(call.options).toEqual({ holdPage: true })
    })
})
