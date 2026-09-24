import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// WHAT AN NDI® SURFACE SAYS WHEN THERE IS NO PICTURE.
//
// This is the part a newcomer meets first, because the common case is a
// machine with no NDI runtime — aylmo is one, and so is every hosted di.iiii.
// A black or white rectangle on a wall is indistinguishable from a mapping
// mistake, so each of these states has to say which of several very different
// jobs is waiting for whoever is at the rig: install the runtime, start the
// sender, open a firewall, or stop expecting NDI here at all.
//
// The probe is mocked: nothing in the default test run may need a runtime, and
// CI has none.
vi.mock('./ndiLink.js', () => ({
    NDI_NOT_HERE: 'this di.iiii cannot receive NDI',
    ndiStreamUrl: ({ name, maxWidth }) => `/ndi/in.mjpg?name=${encodeURIComponent(name)}&w=${maxWidth}`,
    ndiTrouble: vi.fn()
}))

// Partial: the Pictures source reaches the project asset URLs (Clip In), which
// read the rest of apiClient at import time.
vi.mock('../services/apiClient.js', async (importOriginal) => ({
    ...(await importOriginal()),
    apiBaseUrl: 'https://di-studio.xyz/serverXR'
}))

import MapSourceView from './MapSourceView.jsx'
import { ndiTrouble } from './ndiLink.js'
import { normalizeMappingSurface } from '../shared/projectSchema.js'

const ndiSurface = (ref) => normalizeMappingSurface({ id: 'n1', name: 'ԳՈՌ', resolution: [640, 360], source: { kind: 'ndi', ref } })

const showing = (detail) => screen.findByText(detail)

beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    ndiTrouble.mockReset()
})
afterEach(() => { vi.useRealTimers() })

describe('an NDI surface with no picture', () => {
    it('asks for nothing and says so when the surface names no source', () => {
        render(<MapSourceView surface={ndiSurface('')} label="ԳՈՌ" />)
        expect(screen.getByText('no NDI source named')).toBeTruthy()
        expect(ndiTrouble).not.toHaveBeenCalled()
    })

    it('says it is looking, before the first answer comes back', () => {
        ndiTrouble.mockReturnValue(new Promise(() => {}))
        const { container } = render(<MapSourceView surface={ndiSurface('td_out')} label="ԳՈՌ" />)
        expect(screen.getByText('looking for it…')).toBeTruthy()
        expect(screen.getByText('ԳՈՌ')).toBeTruthy()
        // Nothing is asked for until the runtime has answered.
        expect(container.querySelector('img')).toBeNull()
    })

    it('names the runtime and repeats the server’s own one line on fixing it', async () => {
        // THE TRUE STATE ON AYLMO, and on any machine a newcomer starts from.
        // The sentence after the dash is the server's `how`, verbatim — a
        // second vocabulary for the same fact is how two answers to one
        // question get into a building.
        ndiTrouble.mockResolvedValue({
            ready: false,
            settled: false,
            detail: 'NDI is not installed on this machine — install the NDI Runtime from ndi.video, then restart di.iiii'
        })
        const { container } = render(<MapSourceView surface={ndiSurface('td_out')} label="ԳՈՌ" />)
        expect(await showing('NDI is not installed on this machine — install the NDI Runtime from ndi.video, then restart di.iiii')).toBeTruthy()
        // Nothing is dialled while there is nothing to dial with.
        expect(container.querySelector('img')).toBeNull()
    })

    it('says a hosted di.iiii can never receive, and stops asking', async () => {
        // /ndi is behind requireLocalRuntime: a hosted tier 404s the whole
        // lane and always will. Asking again every four seconds for the rest
        // of a show would be a poll that can only ever say the same thing.
        ndiTrouble.mockResolvedValue({ ready: false, settled: true, detail: 'this di.iiii cannot receive NDI' })
        render(<MapSourceView surface={ndiSurface('td_out')} label="ԳՈՌ" />)
        expect(await showing('this di.iiii cannot receive NDI')).toBeTruthy()
        expect(ndiTrouble).toHaveBeenCalledTimes(1)
        await vi.advanceTimersByTimeAsync(20000)
        expect(ndiTrouble).toHaveBeenCalledTimes(1)
    })

    it('says a name nothing on the network is called, and keeps asking', async () => {
        // The sender may be started after the page — nobody should have to
        // reload a wall machine in another room.
        ndiTrouble.mockResolvedValue({ ready: true, settled: false, detail: 'no NDI source called “td_out” on this network' })
        render(<MapSourceView surface={ndiSurface('td_out')} label="ԳՈՌ" />)
        expect(await showing('no NDI source called “td_out” on this network')).toBeTruthy()
        await vi.advanceTimersByTimeAsync(4100)
        expect(ndiTrouble.mock.calls.length).toBeGreaterThan(1)
    })

    it('shows the RECEIVER’s own reason, address and all, once a source resolved', async () => {
        // Step 1 taught the receiver to separate "the media port was never
        // reached" from "the session is open and nothing is coming down it" —
        // two different jobs at the rig. Repeating that sentence is the point;
        // paraphrasing it would lose the address, which the SENDER chose.
        const detail = 'no connection to "AYLMO (td_out_windows)" at 192.168.15.53:5961 after 12 s — check the firewall on that machine, and the route to it'
        ndiTrouble.mockResolvedValue({ ready: true, settled: false, detail })
        render(<MapSourceView surface={ndiSurface('td_out')} label="ԳՈՌ" />)
        expect(await showing(detail)).toBeTruthy()
    })

    it('asks for the picture the moment the runtime is there, and hides it until a frame lands', async () => {
        ndiTrouble.mockResolvedValue({ ready: true, settled: false, detail: 'looking for “td_out”…' })
        const { container } = render(<MapSourceView surface={ndiSurface('td_out')} label="ԳՈՌ" />)
        expect(await showing('looking for “td_out”…')).toBeTruthy()
        const img = container.querySelector('img')
        expect(img).toBeTruthy()
        // The source NAME travels, never an address: the sender picks which of
        // its own interfaces to advertise, so an address written on the desk
        // means nothing on the machine that draws.
        expect(img.getAttribute('src')).toBe('/ndi/in.mjpg?name=td_out&w=640')
        // Not visible yet — a half-loaded <img> must not put a white or broken
        // rectangle on a projector.
        expect(img.className).toBe('map-source-hidden-video')
        expect(container.querySelector('.map-source-placeholder')).toBeTruthy()
    })
})

describe('an NDI surface that gets its picture', () => {
    it('shows the picture and drops the placeholder once a frame paints', async () => {
        ndiTrouble.mockResolvedValue({ ready: true, settled: false, detail: 'looking for “td_out”…' })
        const { container } = render(<MapSourceView surface={ndiSurface('td_out')} label="ԳՈՌ" />)
        await showing('looking for “td_out”…')
        const img = container.querySelector('img')
        img.dispatchEvent(new Event('load'))
        await vi.advanceTimersByTimeAsync(0)
        expect(container.querySelector('img').className).toBe('map-source-media')
        expect(container.querySelector('.map-source-placeholder')).toBeNull()
    })

    it('stops asking why once there is a picture', async () => {
        ndiTrouble.mockResolvedValue({ ready: true, settled: false, detail: 'looking for “td_out”…' })
        const { container } = render(<MapSourceView surface={ndiSurface('td_out')} label="ԳՈՌ" />)
        await showing('looking for “td_out”…')
        container.querySelector('img').dispatchEvent(new Event('load'))
        await vi.advanceTimersByTimeAsync(0)
        const asked = ndiTrouble.mock.calls.length
        await vi.advanceTimersByTimeAsync(20000)
        expect(ndiTrouble.mock.calls.length).toBe(asked)
    })

    it('goes back to saying why when the stream drops, without a reload', async () => {
        // A sender restarting mid-show, or a serverXR restarting under it. The
        // <img> is remounted on useRetryingMedia's schedule; the placeholder
        // comes back at once so the wall never holds a stale last frame under
        // a caption that says nothing.
        ndiTrouble.mockResolvedValue({ ready: true, settled: false, detail: 'looking for “td_out”…' })
        const { container } = render(<MapSourceView surface={ndiSurface('td_out')} label="ԳՈՌ" />)
        await showing('looking for “td_out”…')
        const img = container.querySelector('img')
        img.dispatchEvent(new Event('load'))
        await vi.advanceTimersByTimeAsync(0)
        expect(container.querySelector('.map-source-placeholder')).toBeNull()

        container.querySelector('img').dispatchEvent(new Event('error'))
        await vi.advanceTimersByTimeAsync(0)
        expect(container.querySelector('.map-source-placeholder')).toBeTruthy()
        expect(await showing('looking for “td_out”…')).toBeTruthy()
    })
})
