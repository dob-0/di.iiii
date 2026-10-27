// Marketing audit 2026-10-21: three public pages no page a visitor reads
// linked to — /network (only /spaces did), /suite (none of 21 pages) and
// /for-apps (only /privacy). The landing's footer now names all three.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../components/GridFloorBackground.jsx', () => ({ default: () => <div data-testid="mock-grid-bg" /> }))
vi.mock('../services/serverSpaces.js', () => ({ getServerConfig: () => Promise.resolve({}) }))
window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }))

import LandingPage from './LandingPage.jsx'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { people } = JSON.parse(fs.readFileSync(path.join(ROOT, 'spaces/network/people.json'), 'utf8'))

const footerLinks = () => {
    const { container } = render(<LandingPage />)
    const nav = container.querySelector('.lp-footer-nav')
    return within(nav).getAllByRole('link').map((a) => ({ text: a.textContent, href: a.getAttribute('href') }))
}

describe('the landing footer', () => {
    it('links the network, with the count the roster actually has', () => {
        const link = footerLinks().find((l) => l.href === '/network')
        expect(link).toBeTruthy()
        expect(link.text).toBe(`The network — ${people.length} people`)
    })

    it('links the name-and-mark page', () => {
        expect(footerLinks()).toContainEqual({ text: 'Name and mark', href: '/suite' })
    })

    it('links For apps right before API', () => {
        const links = footerLinks()
        const at = links.findIndex((l) => l.href === '/for-apps')
        expect(links[at]?.text).toBe('For apps')
        expect(links[at + 1]?.text).toBe('API')
    })
})
