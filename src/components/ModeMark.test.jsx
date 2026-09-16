import React from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ModeMark from './ModeMark.jsx'

const getServerConfigMock = vi.hoisted(() => vi.fn())
vi.mock('../services/serverSpaces.js', () => ({
    getServerConfig: (...args) => getServerConfigMock(...args)
}))
vi.mock('../services/apiClient.js', () => ({ hasServerApi: true }))

const atHost = (host) => {
    // jsdom's location is read-only; replacing it is the supported way to sit
    // the component on a different hostname.
    delete window.location
    const [hostname, port] = host.split(':')
    window.location = { hostname, host, port: port || '', search: '' }
}

describe('ModeMark', () => {
    beforeEach(() => {
        getServerConfigMock.mockResolvedValue({ local: false })
    })

    afterEach(() => {
        getServerConfigMock.mockReset()
    })

    it('marks a local install green and names the host', async () => {
        atHost('localhost:4000')
        const { container } = render(<ModeMark />)
        expect(await screen.findByText('LOCAL')).toBeInTheDocument()
        expect(screen.getByText('localhost:4000')).toBeInTheDocument()
        expect(container.querySelector('.mode-mark').getAttribute('style')).toContain('#4df9c0')
    })

    it('marks the dev tier amber as DEV', async () => {
        atHost('dev.diiii.xyz')
        const { container } = render(<ModeMark />)
        expect(await screen.findByText('DEV')).toBeInTheDocument()
        expect(container.querySelector('.mode-mark').getAttribute('style')).toContain('#ffb347')
    })

    // The retired name (staging.di-studio.xyz, DNS gone 2026-09-16) and any
    // self-hosted staging.* host: still DEV, and the chip must not bring the
    // retired word back.
    it('marks the retired staging.di-studio.xyz address DEV too', async () => {
        atHost('staging.di-studio.xyz')
        render(<ModeMark />)
        expect(await screen.findByText('DEV')).toBeInTheDocument()
        expect(screen.queryByText('STAGING')).toBeNull()
        expect(screen.getByText('staging.di-studio.xyz')).toBeInTheDocument()
    })

    // The whole point of the hosted branch: an audience on di-studio.xyz sees
    // precisely what it saw before this component existed.
    it('renders nothing at all on the live site', async () => {
        atHost('di-studio.xyz')
        const { container } = render(<ModeMark />)
        await waitFor(() => expect(getServerConfigMock).toHaveBeenCalled())
        expect(container.firstChild).toBeNull()
    })

    // Space cards render the app in an iframe as a thumbnail; a frame drawn
    // inside every card is noise, not an answer.
    it('stays out of a ?preview=1 thumbnail', () => {
        atHost('localhost:4000')
        window.location.search = '?preview=1'
        const { container } = render(<ModeMark />)
        expect(container.firstChild).toBeNull()
    })

    // A projector output is thrown onto a wall; a frame around it would be
    // projected around the work. Found on asuz driving an Optoma, 2026-09-13.
    it('stays off a projection-mapping output, and stays on its desk', async () => {
        atHost('localhost:4000')
        window.location.pathname = '/stage/map/wall/out'
        const { container } = render(<ModeMark />)
        expect(container.firstChild).toBeNull()

        window.location.pathname = '/stage/map/wall'
        render(<ModeMark />)
        expect(await screen.findByText('LOCAL')).toBeInTheDocument()
    })

    it('never mints a session to find out where it is', async () => {
        atHost('localhost:4000')
        render(<ModeMark />)
        await waitFor(() => expect(getServerConfigMock).toHaveBeenCalled())
        // /api/auth/session would create a guest for every anonymous visitor.
        expect(getServerConfigMock).toHaveBeenCalledTimes(1)
    })

    // A tailnet or LAN name looks public; only the server can tell the truth.
    it('believes the server when the hostname looks hosted', async () => {
        atHost('aylmo.tail1234.ts.net')
        getServerConfigMock.mockResolvedValue({ local: true })
        render(<ModeMark />)
        expect(await screen.findByText('LOCAL')).toBeInTheDocument()
    })

    it('still marks localhost when the server never answers', async () => {
        atHost('localhost:4000')
        getServerConfigMock.mockRejectedValue(new Error('offline'))
        render(<ModeMark />)
        expect(await screen.findByText('LOCAL')).toBeInTheDocument()
    })

    // The chip must never be the thing sitting on top of a page's own
    // bottom-left controls — it introduces itself, then gets out of the way.
    describe('the chip collapse', () => {
        beforeEach(() => vi.useFakeTimers())
        afterEach(() => vi.useRealTimers())

        it('shows the label and hostname at mount, then collapses into the frame after 4s', async () => {
            atHost('dev.diiii.xyz')
            const { container } = render(<ModeMark />)
            // flush the getServerConfig microtask without advancing the collapse timer
            await act(async () => { await vi.advanceTimersByTimeAsync(0) })

            expect(screen.getByText('DEV')).toBeInTheDocument()
            expect(screen.getByText('dev.diiii.xyz')).toBeInTheDocument()
            expect(container.querySelector('.mode-mark').getAttribute('data-collapsed')).toBe('false')

            await act(async () => { await vi.advanceTimersByTimeAsync(4000) })

            expect(container.querySelector('.mode-mark').getAttribute('data-collapsed')).toBe('true')
            // The label is still in the DOM (CSS hides it) — assert on the
            // attribute the CSS actually keys off, not on text removal.
            expect(screen.getByText('DEV')).toBeInTheDocument()
        })

        it('does not collapse early', async () => {
            atHost('dev.diiii.xyz')
            const { container } = render(<ModeMark />)
            await act(async () => { await vi.advanceTimersByTimeAsync(3999) })
            expect(container.querySelector('.mode-mark').getAttribute('data-collapsed')).toBe('false')
        })
    })
})
