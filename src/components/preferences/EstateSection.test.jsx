import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../../services/apiClient.js', () => ({
    getEstateMap: vi.fn(),
    hasServerApi: true
}))

import { getEstateMap } from '../../services/apiClient.js'
import EstateSection, { asDarkDocument } from './EstateSection.jsx'

beforeEach(() => {
    vi.clearAllMocks()
})

describe('EstateSection', () => {
    // The map is infrastructure topology in a PUBLIC repo's app. If the frame
    // ever gains allow-scripts (or loses sandbox), page-supplied HTML runs with
    // the admin page's privileges. This is the guard for that, and it is the
    // reason the map is fetched rather than bundled.
    it('renders the map in a frame with sandbox fully closed', async () => {
        getEstateMap.mockResolvedValue({
            html: '<h1>the estate</h1>',
            updatedAt: '2026-08-10T00:00:00.000Z',
            bytes: 2048,
            name: 'estate-map.html'
        })
        const { container } = render(<EstateSection />)
        const frame = await waitFor(() => {
            const el = container.querySelector('iframe')
            expect(el).toBeTruthy()
            return el
        })
        expect(frame.getAttribute('sandbox')).toBe('')
        expect(frame.getAttribute('srcdoc')).toContain('the estate')
        // the console is always dark; the map must not follow the visitor's OS
        expect(frame.getAttribute('srcdoc')).toContain('data-theme="dark"')
        expect(frame.getAttribute('src')).toBeNull()
    })

    it('says the map is simply absent when the host was never given one', async () => {
        getEstateMap.mockRejectedValue(Object.assign(new Error('nope'), { status: 404 }))
        render(<EstateSection />)
        await waitFor(() => {
            expect(screen.getByText(/No map on this host/i)).toBeTruthy()
        })
        expect(document.querySelector('iframe')).toBeNull()
    })

    it('reports a real failure differently from an absent map', async () => {
        getEstateMap.mockRejectedValue(Object.assign(new Error('disk on fire'), { status: 500 }))
        render(<EstateSection />)
        await waitFor(() => {
            expect(screen.getByText(/Could not read the map/i)).toBeTruthy()
        })
        expect(screen.queryByText(/No map on this host/i)).toBeNull()
    })

    it('shows where the file came from and when, so a stale map is visible', async () => {
        getEstateMap.mockResolvedValue({
            html: '<p>x</p>',
            updatedAt: '2026-08-10T12:00:00.000Z',
            bytes: 1024 * 1024,
            name: 'estate-map.html'
        })
        render(<EstateSection />)
        await waitFor(() => {
            expect(screen.getByText('2026-08-10')).toBeTruthy()
        })
        expect(screen.getByText('1.0 MB')).toBeTruthy()
        expect(screen.getByText('estate-map.html')).toBeTruthy()
    })

    it('frames the map as a dark document, since the console has no light mode', () => {
        const out = asDarkDocument('<title>x</title><p>y</p>')
        expect(out.startsWith('<!doctype html>')).toBe(true)
        expect(out).toContain('data-theme="dark"')
        expect(out).toContain('<p>y</p>')
    })
})
