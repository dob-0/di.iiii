// The cue list inside the room (RoomCueList.jsx): what it SENDS and what it refuses. The server
// answer has the shape of serverXR/src/routes/showRoutes.js (proven on the wire by showContracts).
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RoomCueList from './RoomCueList.jsx'

const answer = (over = {}) => ({
    space: { id: 'moxir', label: 'MOXIR' },
    project: { id: 'moxir-v1-1', slug: 'v1-1', title: 'MOXIR v1.1' },
    cues: [
        { index: 0, id: 'c1', name: 'a', title: 'still smoking', line: 'holds 20 s', swatch: [{ hex: '#ff3a12', word: 'ember' }], laser: null },
        { index: 1, id: 'c2', name: 'b', title: 'one line', line: 'holds 20 s', swatch: [], laser: 'lit' },
        { index: 2, id: 'c3', name: 'c', title: 'the black', line: 'holds 4 s', swatch: [], laser: null }
    ],
    clock: { showEpoch: null, loop: true, showSource: null, cues: [] },
    light: { state: 'open', otherShow: false, otherList: false },
    live: { index: 0, n: 3, running: true, loop: false, autoplay: false, nextIndex: -1, nextInMs: null, by: null, missing: 0 },
    control: { choosers: 'team', cooldownMs: 10000, cooldownLeftMs: 0, last: null },
    you: { who: 'operator', block: '', authOff: false },
    now: Date.now(),
    ...over
})
const respond = (body, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('the cue list in the room', () => {
    it('lists the cues; a tap posts index and id to the same choose route', async () => {
        const calls = []
        vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => { calls.push([String(url), init]); return respond(answer()) })
        const onChosen = vi.fn()
        render(<RoomCueList spaceId="moxir" projectId="v1-1" onChosen={onChosen} />)
        await screen.findByText('the black')
        expect(screen.getByRole('link', { name: /open the show page/ }).getAttribute('href')).toBe('/moxir/show/v1-1')
        await act(async () => { fireEvent.click(document.querySelector('[data-cue="2"]')) })
        const post = calls.find(([, init]) => init?.method === 'POST')
        expect(post[0]).toMatch(/\/api\/spaces\/moxir\/show\/v1-1\/choose$/)
        expect(JSON.parse(post[1].body)).toMatchObject({ index: 2, cueId: 'c3' })
        expect(onChosen).toHaveBeenCalled()
    })

    it('a laser moment is listed and never tappable', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(() => respond(answer()))
        render(<RoomCueList spaceId="moxir" projectId="v1-1" />)
        await screen.findByText('one line')
        expect(document.querySelector('[data-cue="1"]').disabled).toBe(true)
    })

    it('where the server says you watch, nothing is tappable', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(() => respond(answer({ you: { who: 'visitor', block: 'team-only', authOff: false } })))
        render(<RoomCueList spaceId="moxir" projectId="v1-1" />)
        await screen.findByText('the black')
        expect(document.querySelector('[data-cue="2"]').disabled).toBe(true)
        expect(screen.getByText(/You watch/)).toBeTruthy()
    })

    it('a pressed scene holds: the live one is marked, and there is no countdown or "next" anywhere', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(() => respond(answer()))
        render(<RoomCueList spaceId="moxir" projectId="v1-1" />)
        await screen.findByText('the black')
        expect(document.querySelector('[data-cue="0"]').getAttribute('aria-current')).toBe('true')
        expect(document.body.textContent).not.toMatch(/next in|waits for GO|\bnext\b/i)
    })
})
