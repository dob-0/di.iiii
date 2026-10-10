// The ten favourite scene buttons (five before 2026-10-09) in the room (RoomFavourites.jsx) and the stars in the list (RoomCueList.jsx).
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RoomFavourites from './RoomFavourites.jsx'
import RoomCueList from './RoomCueList.jsx'

const cue = (i, title, over = {}) => ({ index: i, id: `c${i}`, name: title, title, line: '', swatch: [{ hex: '#ff3a12', word: 'ember' }], laser: null, lookId: `rig-l${i}`, ...over })
const answer = (over = {}) => ({
    space: { id: 'moxir', label: 'MOXIR' },
    project: { id: 'moxir-v1-1', slug: 'v1-1', title: 'MOXIR v1.1' },
    cues: [cue(0, 'still smoking'), cue(1, 'one line', { laser: 'lit' }), cue(2, 'the black'), cue(3, 'ash'), cue(4, 'embers'), cue(5, 'dawn'), cue(6, 'night')],
    clock: { showEpoch: null, loop: true, showSource: null, cues: [] },
    light: { state: 'open', otherShow: false, otherList: false },
    live: { index: 2, n: 7, running: true, loop: false, autoplay: false, nextIndex: -1, nextInMs: null, by: null, missing: 0 },
    control: { choosers: 'team', cooldownMs: 10000, cooldownLeftMs: 0, last: null, favourites: ['rig-l0', 'rig-l2', 'rig-l3', 'rig-l4', 'rig-l5'], favouritesSet: false },
    you: { who: 'member', block: '', authOff: false },
    now: Date.now(),
    ...over
})
const respond = (body, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('the favourite row', () => {
    it('shows exactly the server\'s five, marks the live one, and a tap posts the same choose', async () => {
        const calls = []
        vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => { calls.push([String(url), init]); return respond(answer()) })
        render(<RoomFavourites spaceId="moxir" projectId="v1-1" />)
        await screen.findByText('the black')
        expect(document.querySelectorAll('[data-fav]').length).toBe(5)
        expect(document.querySelector('[data-fav="rig-l2"]').getAttribute('aria-current')).toBe('true')
        expect(document.querySelector('[data-fav="rig-l3"]').getAttribute('aria-current')).toBe(null)
        await act(async () => { fireEvent.click(document.querySelector('[data-fav="rig-l3"]')) })
        const post = calls.find(([, init]) => init?.method === 'POST')
        expect(post[0]).toMatch(/\/api\/spaces\/moxir\/show\/v1-1\/choose$/)
        expect(JSON.parse(post[1].body)).toMatchObject({ index: 3, cueId: 'c3' })
    })

    it('ten favourites are ten buttons: one row on a wide screen, two rows of five on a phone', async () => {
        const cues = Array.from({ length: 10 }, (_, i) => cue(i, `scene ${i + 1}`))
        const a = answer({ cues, live: { index: 0, n: 10, running: true, loop: false, autoplay: false, nextIndex: -1, nextInMs: null, by: null, missing: 0 } })
        a.control.favourites = cues.map((c) => c.lookId)
        vi.spyOn(globalThis, 'fetch').mockImplementation(() => respond(a))
        const mm = (matches) => { window.matchMedia = () => ({ matches, addEventListener() {}, removeEventListener() {} }) }
        mm(true)
        render(<RoomFavourites spaceId="moxir" projectId="v1-1" />)
        await screen.findByText('scene 1')
        expect(document.querySelectorAll('[data-fav]').length).toBe(10)
        expect(document.querySelector('[aria-label="favourite scenes"]').getAttribute('data-cols')).toBe('10')
        cleanup()
        mm(false)
        render(<RoomFavourites spaceId="moxir" projectId="v1-1" />)
        await screen.findByText('scene 1')
        expect(document.querySelectorAll('[data-fav]').length).toBe(10)
        expect(document.querySelector('[aria-label="favourite scenes"]').getAttribute('data-cols')).toBe('5')
        delete window.matchMedia
    })

    it('where the server says you watch (or the cooldown runs) every button is disabled', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(() => respond(answer({ you: { who: 'visitor', block: 'team-only', authOff: false } })))
        render(<RoomFavourites spaceId="moxir" projectId="v1-1" />)
        await screen.findByText('the black')
        expect([...document.querySelectorAll('[data-fav]')].every((b) => b.disabled)).toBe(true)
    })

    it('a laser scene is never tappable, even if it were listed', async () => {
        const a = answer()
        a.control.favourites = ['rig-l1', 'rig-l2']
        vi.spyOn(globalThis, 'fetch').mockImplementation(() => respond(a))
        render(<RoomFavourites spaceId="moxir" projectId="v1-1" />)
        await screen.findByText('the black')
        expect(document.querySelector('[data-fav="rig-l1"]').disabled).toBe(true)
    })

    it('draws nothing when there are no favourites', async () => {
        const a = answer()
        a.control.favourites = []
        vi.spyOn(globalThis, 'fetch').mockImplementation(() => respond(a))
        render(<RoomFavourites spaceId="moxir" projectId="v1-1" />)
        await act(async () => { await Promise.resolve() })
        expect(document.querySelector('[data-testid="room-favourites"]')).toBe(null)
    })
})

describe('the stars in the list', () => {
    it('only the operator sees stars, and never on a laser scene', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(() => respond(answer({ you: { who: 'member', block: '', authOff: false } })))
        const { unmount } = render(<RoomCueList spaceId="moxir" projectId="v1-1" />)
        await screen.findByText('the black')
        expect(document.querySelectorAll('[data-star]').length).toBe(0)
        unmount()
        vi.restoreAllMocks()
        vi.spyOn(globalThis, 'fetch').mockImplementation(() => respond(answer({ you: { who: 'operator', block: '', authOff: false } })))
        render(<RoomCueList spaceId="moxir" projectId="v1-1" />)
        await screen.findByText('the black')
        expect(document.querySelector('[data-star="rig-l1"]')).toBe(null)
        expect(document.querySelector('[data-star="rig-l2"]').getAttribute('aria-pressed')).toBe('true')
        expect(document.querySelector('[data-star="rig-l1"]')).toBe(null)
    })

    it('a star posts the new list to the favourites route and tells the row', async () => {
        const calls = []
        vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => { calls.push([String(url), init]); return respond(answer({ you: { who: 'operator', block: '', authOff: false } })) })
        const heard = vi.fn()
        window.addEventListener('di:show-answer', heard)
        render(<RoomCueList spaceId="moxir" projectId="v1-1" />)
        await screen.findByText('the black')
        await act(async () => { fireEvent.click(document.querySelector('[data-star="rig-l6"]')) })
        const post = calls.find(([, init]) => init?.method === 'POST')
        expect(post[0]).toMatch(/\/show\/v1-1\/favourites$/)
        expect(JSON.parse(post[1].body).favourites).toEqual(['rig-l0', 'rig-l2', 'rig-l3', 'rig-l4', 'rig-l5', 'rig-l6'])
        expect(heard).toHaveBeenCalled()
        window.removeEventListener('di:show-answer', heard)
    })
})
