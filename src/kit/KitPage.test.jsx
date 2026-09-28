import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../components/SurfaceBar.jsx', () => ({ default: () => null }))
const session = { sandboxSpaceId: null }
vi.mock('../hooks/useAuthSession.js', () => ({ default: () => session }))
vi.mock('./kitWeights.json', () => ({
    default: { measured: '2026-09-28', kitPageKB: 12, coreKB: 100, threeKB: 450, firstLoadKB: 200, firstLoadPhoneKB: 200 }
}))

import KitPage from './KitPage.jsx'
import { KIT_TOOLS, kitGroupsWithTools } from './kitCatalogue.js'

const cards = () => [...document.querySelectorAll('.kit-card')]
const cardOf = (id) => document.getElementById(`kit-${id}`)

describe('the Kit at /tools', () => {
    beforeEach(() => {
        session.sandboxSpaceId = null
        window.history.replaceState({}, '', '/tools')
    })

    it('draws one card per tool, in groups, and no group without a card', () => {
        render(<KitPage />)
        expect(cards()).toHaveLength(KIT_TOOLS.length)
        for (const group of kitGroupsWithTools()) {
            expect(document.getElementById(`kit-group-${group.id}`)).toBeTruthy()
        }
        expect(document.getElementById('kit-group-capture')).toBeNull()
    })

    it('starts with no live frame: a first load fetches no tool', () => {
        render(<KitPage />)
        expect(document.querySelector('iframe')).toBeNull()
        expect(document.querySelectorAll('.kit-poster').length).toBeGreaterThan(10)
    })

    it('goes live one card at a time, at the real route with ?preview=1', () => {
        render(<KitPage />)
        fireEvent.pointerEnter(cardOf('walk'))
        let frames = document.querySelectorAll('iframe')
        expect(frames).toHaveLength(1)
        expect(frames[0].getAttribute('src')).toBe('/wcc/alla-virabyan?preview=1')
        expect(frames[0].getAttribute('tabindex')).toBe('-1')

        fireEvent.pointerEnter(cardOf('nodes'))
        frames = document.querySelectorAll('iframe')
        expect(frames).toHaveLength(1)
        expect(frames[0].getAttribute('src')).toBe('/open/raw/projects/open-jam?preview=1')
    })

    it('has a "live" button on every framed card, reachable without a mouse', () => {
        render(<KitPage />)
        const button = screen.getByRole('button', { name: 'Show Nodes live' })
        fireEvent.click(button)
        expect(document.querySelector('iframe').getAttribute('src')).toBe('/open/raw/projects/open-jam?preview=1')
    })

    it('opens each tool at the audit’s path with one Try link, and says plainly when sign-in is needed', () => {
        render(<KitPage />)
        expect(cardOf('nodes').querySelector('.kit-try').getAttribute('href')).toBe('/open/raw/projects/open-jam')
        expect(cardOf('projection').querySelector('.kit-try').getAttribute('href')).toBe('/open/map/open-jam')
        expect(cardOf('light').querySelector('.kit-try').getAttribute('href')).toBe('/light')
        expect(cardOf('publishing').querySelector('.kit-try')).toBeNull()
        expect(cardOf('publishing').textContent).toMatch(/Sign in/)
        expect(cardOf('rig').querySelector('.kit-try')).toBeNull()
        expect(cardOf('rig').textContent).toMatch(/how to install/)
    })

    it('gives the sandbox a door once the session says which one is yours', async () => {
        session.sandboxSpaceId = 'sandbox-guest1234'
        render(<KitPage />)
        await waitFor(() => expect(cardOf('sandbox').querySelector('.kit-try')).toBeTruthy())
        expect(cardOf('sandbox').querySelector('.kit-try').getAttribute('href')).toBe('/sandbox-guest1234/studio')
    })

    it('keeps the sandbox card honest with no session: a still and no button, never a broken link', () => {
        render(<KitPage />)
        expect(cardOf('sandbox').querySelector('.kit-try')).toBeNull()
        expect(cardOf('sandbox').querySelector('.kit-live-button')).toBeNull()
    })

    it('links every library to its own site and every source to the public repo', () => {
        render(<KitPage />)
        const made = [...cardOf('walk').querySelectorAll('.kit-fact')].find((row) => row.textContent.startsWith('Made with'))
        const hrefs = [...made.querySelectorAll('a')].map((a) => a.getAttribute('href'))
        expect(hrefs).toContain('https://threejs.org')
        const source = [...cardOf('walk').querySelectorAll('.kit-sources a')].map((a) => a.getAttribute('href'))
        expect(source).toContain('https://github.com/dob-0/di.iiii/blob/dev/src/components/LiveProjectScene.jsx')
        expect(source.at(-1)).toBe('/wiki#scenes-that-show-themselves')
    })

    it('says where a tool runs, and points install-only ones at how to install', () => {
        render(<KitPage />)
        expect(cardOf('walk').querySelector('.kit-where').textContent).toBe('on the web')
        const where = cardOf('light').querySelector('.kit-where a')
        expect(where.textContent).toBe('on your own di.iiii')
        expect(where.getAttribute('href')).toBe('/wiki#di-cli-local')
    })

    it('shows what we use, with the measured weights in a sentence', () => {
        render(<KitPage />)
        const stack = document.getElementById('kit-stack')
        expect(stack.textContent).toMatch(/each part loads only when a piece uses it/)
        expect(stack.textContent).toMatch(/12 KB of its own code/)
        expect(stack.querySelectorAll('tbody tr').length).toBeGreaterThan(40)
    })
})
