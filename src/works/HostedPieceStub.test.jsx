import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HostedPieceStub from './HostedPieceStub.jsx'
import { PREVIEW_STUB_MESSAGE } from '../utils/previewMode.js'

// What a work's route renders under DI_PROFILE=local. On the festival machine
// the front room's WCC and algovrithm doors landed on one sentence with no way
// back; this is the contract that keeps the doors on it.

const renderAt = (path) => render(
    <MemoryRouter initialEntries={[path]}>
        <HostedPieceStub />
    </MemoryRouter>
)

afterEach(() => {
    vi.restoreAllMocks()
})

describe('HostedPieceStub', () => {
    it('names the piece and offers two ways back: the spaces, and the space itself in Studio', () => {
        renderAt('/wcc')

        expect(screen.getByRole('heading', { name: 'WCC Exhibition' })).toBeInTheDocument()
        expect(screen.getByText(/left out of this copy/)).toBeInTheDocument()

        const spaces = screen.getByRole('link', { name: '← the spaces' })
        expect(spaces.getAttribute('href')).toBe('/')
        // A card made live embeds this route; a way back that only moved the
        // thumbnail would be no way back.
        expect(spaces.getAttribute('target')).toBe('_top')

        const studio = screen.getByRole('link', { name: 'the wcc space in Studio' })
        expect(studio.getAttribute('href')).toBe('/wcc/studio')
        expect(studio.getAttribute('target')).toBe('_top')

        // where the piece actually lives
        expect(screen.getByRole('link', { name: 'di-studio.xyz/wcc' }).getAttribute('href')).toBe('https://di-studio.xyz/wcc')
    })

    it('knows the piece from the route, including its /scene half', () => {
        renderAt('/algovrithm/scene')
        expect(screen.getByRole('heading', { name: 'algovrithm' })).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'the algovrithm space in Studio' }).getAttribute('href')).toBe('/algovrithm/studio')
    })

    it('tells the space card it is a stub when embedded as a preview', () => {
        const postMessage = vi.fn()
        vi.spyOn(window, 'parent', 'get').mockReturnValue({ postMessage })

        renderAt('/wcc?preview=1')

        expect(postMessage).toHaveBeenCalledWith(
            { type: PREVIEW_STUB_MESSAGE, spaceId: 'wcc' },
            window.location.origin
        )
    })

    it('says nothing to a host when opened as a page', () => {
        const postMessage = vi.fn()
        vi.spyOn(window, 'parent', 'get').mockReturnValue({ postMessage })

        renderAt('/wcc')

        expect(postMessage).not.toHaveBeenCalled()
    })
})
