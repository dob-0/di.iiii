import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../services/apiClient.js', async (importOriginal) => ({
    ...(await importOriginal()),
    apiBaseUrl: 'https://di-studio.xyz/serverXR'
}))

import MapSourceView, { webPageFrameFor } from './MapSourceView.jsx'
import { normalizeMappingSurface } from '../shared/projectSchema.js'

// A url surface shows a web page: an absolute http(s) address, nothing else
// (WHATWG URL parsing, then the scheme). A page from another origin keeps its
// own origin inside the sandbox; a page from this origin gets scripts only, so
// it never runs with this page's origin (WHATWG HTML, the iframe sandbox note
// on allow-scripts + allow-same-origin).

const surfaceOf = (ref) => normalizeMappingSurface({
    id: 's1', name: 'wall', resolution: [640, 360], source: { kind: 'url', ref }
})

const HERE = window.location.origin

describe('which web addresses a url surface shows', () => {
    it.each([
        ['javascript:alert(1)'],
        ['  JavaScript:alert(1)'],
        ['data:text/html,<p>x</p>'],
        ['vbscript:x'],
        ['file:///etc/hosts'],
        ['example.com'],
        ['/serverXR/api/spaces'],
        ['not a url']
    ])('refuses %j', (ref) => {
        expect(webPageFrameFor(ref, HERE)).toBeNull()
    })

    it('shows another origin with its own origin kept', () => {
        expect(webPageFrameFor('https://example.test/show', HERE)).toEqual({
            src: 'https://example.test/show',
            sandbox: 'allow-scripts allow-same-origin'
        })
        expect(webPageFrameFor('http://192.168.1.20:8080/', HERE)?.sandbox).toBe('allow-scripts allow-same-origin')
    })

    it('shows this origin with scripts only', () => {
        expect(webPageFrameFor(`${HERE}/some/page`, HERE)).toEqual({ src: `${HERE}/some/page`, sandbox: 'allow-scripts' })
    })
})

describe('a live url surface on the wall', () => {
    it('never puts a javascript: address into a frame', async () => {
        const { container } = render(<MapSourceView surface={surfaceOf('javascript:alert(document.domain)')} live label="wall" />)
        expect(await screen.findByText(/http or https/)).toBeTruthy()
        expect(container.querySelector('iframe')).toBeNull()
    })

    it('frames another origin, sandboxed with its own origin', async () => {
        const { container } = render(<MapSourceView surface={surfaceOf('https://example.test/')} live label="wall" />)
        const frame = await vi.waitFor(() => {
            const f = container.querySelector('iframe')
            if (!f) throw new Error('no frame yet')
            return f
        })
        expect(frame.getAttribute('src')).toBe('https://example.test/')
        expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin')
    })

    it('frames this origin without allow-same-origin', async () => {
        const { container } = render(<MapSourceView surface={surfaceOf(`${HERE}/a/page`)} live label="wall" />)
        const frame = await vi.waitFor(() => {
            const f = container.querySelector('iframe')
            if (!f) throw new Error('no frame yet')
            return f
        })
        expect(frame.getAttribute('sandbox')).toBe('allow-scripts')
    })
})
