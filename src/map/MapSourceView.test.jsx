import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

vi.mock('../services/apiClient.js', () => ({
    apiBaseUrl: 'https://di-studio.xyz/serverXR'
}))

import MapSourceView, { resolveMapSourceRef } from './MapSourceView.jsx'
import { normalizeMappingSurface } from '../shared/projectSchema.js'

const surfaceOf = (source, patch = {}) => normalizeMappingSurface({
    id: 's1', name: 'ԳՈՌ', resolution: [640, 360], source, ...patch
})

beforeEach(() => {
    vi.stubGlobal('navigator', {
        ...navigator,
        mediaDevices: { getUserMedia: vi.fn(() => Promise.reject(new Error('no device'))) }
    })
})

describe('what a surface draws', () => {
    it('draws a test pattern for a test source', () => {
        const { container } = render(<MapSourceView surface={surfaceOf({ kind: 'test', ref: 'rings' })} label="ԳՈՌ" />)
        expect(container.querySelector('.map-source-svg')).toBeTruthy()
        expect(screen.getByText('ԳՈՌ')).toBeTruthy()
    })

    it('draws a flat fill for a colour source', () => {
        const { container } = render(<MapSourceView surface={surfaceOf({ kind: 'colour', ref: '#ff0000' })} />)
        expect(container.querySelector('.map-source-fill')).toBeTruthy()
    })

    it('takes a camera surface with no device as THE DEFAULT CAMERA, not an unfinished one', () => {
        // This is the regression: an earlier `!ref` fallback caught every kind
        // and quietly rendered a test pattern instead, making the camera
        // branch unreachable. An empty ref for a camera means "whichever
        // camera this machine has".
        const { container } = render(<MapSourceView surface={surfaceOf({ kind: 'camera', ref: '' })} label="ԳՈՌ" />)
        expect(container.querySelector('.map-source-svg')).toBeNull()
    })

    it('says why rather than going black when a camera cannot be opened', async () => {
        // A black rectangle on a wall is indistinguishable from a mapping
        // mistake, so a refused camera has to speak. It shows a <video> first
        // and only learns there is no device when getUserMedia rejects, so
        // this waits rather than asserting on the first frame.
        render(<MapSourceView surface={surfaceOf({ kind: 'camera', ref: '' })} label="ԳՈՌ" />)
        expect(await screen.findByText('camera unavailable')).toBeTruthy()
        expect(screen.getByText('ԳՈՌ')).toBeTruthy()
    })

    it('falls back to a pattern only for the kinds that are meaningless without an address', () => {
        const { container } = render(<MapSourceView surface={surfaceOf({ kind: 'url', ref: '' })} />)
        expect(container.querySelector('.map-source-svg')).toBeTruthy()
    })

    it('holds a page surface as a card until it is asked to run', () => {
        render(<MapSourceView surface={surfaceOf({ kind: 'url', ref: 'https://example.test' })} live={false} label="ԳՈՌ" />)
        expect(screen.getByText('https://example.test')).toBeTruthy()
    })

    it('says so on the surface when motion glow has no WebGL to run on', async () => {
        // A black rectangle again would read as a mapping mistake. jsdom has no
        // WebGL, which is exactly the machine this sentence is for.
        render(<MapSourceView surface={surfaceOf({ kind: 'camera', ref: '' }, { effect: { kind: 'motion' } })} label="ԳՈՌ" />)
        expect(await screen.findByText('no WebGL on this machine')).toBeTruthy()
    })

    it('mounts a brought-in file onto an image element', () => {
        const { container } = render(<MapSourceView surface={surfaceOf({ kind: 'image', ref: '/api/projects/p1/assets/a1' })} />)
        expect(container.querySelector('img').src).toBe('https://di-studio.xyz/serverXR/api/projects/p1/assets/a1')
    })

    it('mounts a brought-in file onto a video element', () => {
        const { container } = render(<MapSourceView surface={surfaceOf({ kind: 'video', ref: '/api/projects/p1/assets/a1' })} />)
        expect(container.querySelector('video').src).toBe('https://di-studio.xyz/serverXR/api/projects/p1/assets/a1')
    })

    it('leaves a typed web address untouched', () => {
        const { container } = render(<MapSourceView surface={surfaceOf({ kind: 'image', ref: 'https://example.test/wall.jpg' })} />)
        expect(container.querySelector('img').src).toBe('https://example.test/wall.jpg')
    })
})

describe('resolveMapSourceRef', () => {
    it('mounts a project-relative asset path onto the deployed API base', () => {
        expect(resolveMapSourceRef('/api/projects/p1/assets/a1'))
            .toBe('https://di-studio.xyz/serverXR/api/projects/p1/assets/a1')
    })

    it('leaves an absolute address untouched', () => {
        expect(resolveMapSourceRef('https://example.test/wall.jpg')).toBe('https://example.test/wall.jpg')
    })

    it('leaves an empty ref alone', () => {
        expect(resolveMapSourceRef('')).toBe('')
    })
})

// The wall's server hands out the file's NAME a second or more before its
// BYTES land (a separate transfer). The <video>/<img> below requests the url
// immediately, gets a 404, and — without this — stays dead forever; reloading
// the page was the only thing that made it play. A show machine runs
// unattended for hours, so the surface has to ask again on its own.
describe('a brought-in file that fails to load retries itself', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('remounts a video 2 seconds after it fails to load', () => {
        const { container } = render(<MapSourceView surface={surfaceOf({ kind: 'video', ref: '/api/projects/p1/assets/a1' })} />)
        const first = container.querySelector('video')
        act(() => { fireEvent.error(first) })

        act(() => { vi.advanceTimersByTime(1999) })
        expect(container.querySelector('video')).toBe(first)

        act(() => { vi.advanceTimersByTime(1) })
        expect(container.querySelector('video')).not.toBe(first)
        // Same content address — a remount, not a different file.
        expect(container.querySelector('video').src).toBe('https://di-studio.xyz/serverXR/api/projects/p1/assets/a1')
    })

    it('waits 4 seconds after a second failure', () => {
        const { container } = render(<MapSourceView surface={surfaceOf({ kind: 'video', ref: '/api/projects/p1/assets/a1' })} />)
        act(() => { fireEvent.error(container.querySelector('video')) })
        act(() => { vi.advanceTimersByTime(2000) })

        const second = container.querySelector('video')
        act(() => { fireEvent.error(second) })

        act(() => { vi.advanceTimersByTime(3999) })
        expect(container.querySelector('video')).toBe(second)

        act(() => { vi.advanceTimersByTime(1) })
        expect(container.querySelector('video')).not.toBe(second)
    })

    it('caps the wait at 15 seconds and keeps retrying there', () => {
        const { container } = render(<MapSourceView surface={surfaceOf({ kind: 'video', ref: '/api/projects/p1/assets/a1' })} />)
        const delays = [2000, 4000, 8000, 15000, 15000]
        for (const delay of delays) {
            act(() => { fireEvent.error(container.querySelector('video')) })
            const stale = container.querySelector('video')
            act(() => { vi.advanceTimersByTime(delay - 1) })
            expect(container.querySelector('video')).toBe(stale)
            act(() => { vi.advanceTimersByTime(1) })
            expect(container.querySelector('video')).not.toBe(stale)
        }
    })

    it('stops retrying once the file loads', () => {
        const { container } = render(<MapSourceView surface={surfaceOf({ kind: 'video', ref: '/api/projects/p1/assets/a1' })} />)
        const first = container.querySelector('video')
        act(() => { fireEvent.error(first) })
        act(() => { vi.advanceTimersByTime(2000) })

        const loaded = container.querySelector('video')
        act(() => { fireEvent.loadedData(loaded) })

        act(() => { vi.advanceTimersByTime(60000) })
        expect(container.querySelector('video')).toBe(loaded)
        expect(vi.getTimerCount()).toBe(0)
    })

    it('resets the schedule when the ref changes', () => {
        const { container, rerender } = render(<MapSourceView surface={surfaceOf({ kind: 'video', ref: '/api/projects/p1/assets/a1' })} />)
        act(() => { fireEvent.error(container.querySelector('video')) })
        act(() => { vi.advanceTimersByTime(2000) })
        // Next wait, uninterrupted, would be 4s — the point of this test is
        // that switching files starts back at 2s instead.

        rerender(<MapSourceView surface={surfaceOf({ kind: 'video', ref: '/api/projects/p1/assets/a2' })} />)
        const swapped = container.querySelector('video')
        expect(swapped.src).toBe('https://di-studio.xyz/serverXR/api/projects/p1/assets/a2')

        act(() => { fireEvent.error(swapped) })
        act(() => { vi.advanceTimersByTime(1999) })
        expect(container.querySelector('video')).toBe(swapped)

        act(() => { vi.advanceTimersByTime(1) })
        expect(container.querySelector('video')).not.toBe(swapped)
    })

    it('clears its timer on unmount', () => {
        const { container, unmount } = render(<MapSourceView surface={surfaceOf({ kind: 'video', ref: '/api/projects/p1/assets/a1' })} />)
        act(() => { fireEvent.error(container.querySelector('video')) })
        expect(vi.getTimerCount()).toBe(1)

        unmount()
        expect(vi.getTimerCount()).toBe(0)
    })

    it('renders no placeholder and no new text while a video is failing', () => {
        const { container } = render(<MapSourceView surface={surfaceOf({ kind: 'video', ref: '/api/projects/p1/assets/a1' })} label="ԳՈՌ" />)
        act(() => { fireEvent.error(container.querySelector('video')) })
        act(() => { vi.advanceTimersByTime(2000) })
        expect(container.querySelector('.map-source-placeholder')).toBeNull()
        expect(screen.queryByText('ԳՈՌ')).toBeNull()
    })

    it('remounts an image 2 seconds after it fails to load, the same as a video', () => {
        const { container } = render(<MapSourceView surface={surfaceOf({ kind: 'image', ref: '/api/projects/p1/assets/a1' })} />)
        const first = container.querySelector('img')
        act(() => { fireEvent.error(first) })

        act(() => { vi.advanceTimersByTime(1999) })
        expect(container.querySelector('img')).toBe(first)

        act(() => { vi.advanceTimersByTime(1) })
        expect(container.querySelector('img')).not.toBe(first)
        expect(container.querySelector('img').src).toBe('https://di-studio.xyz/serverXR/api/projects/p1/assets/a1')
    })

    it('stops retrying an image once it loads', () => {
        const { container } = render(<MapSourceView surface={surfaceOf({ kind: 'image', ref: '/api/projects/p1/assets/a1' })} />)
        const first = container.querySelector('img')
        act(() => { fireEvent.error(first) })
        act(() => { vi.advanceTimersByTime(2000) })

        const loaded = container.querySelector('img')
        act(() => { fireEvent.load(loaded) })

        act(() => { vi.advanceTimersByTime(60000) })
        expect(container.querySelector('img')).toBe(loaded)
        expect(vi.getTimerCount()).toBe(0)
    })
})

