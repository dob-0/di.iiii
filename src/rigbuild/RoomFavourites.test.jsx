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
// the bricks are behind one small control, closed at first load (the scene is the page); the tests of the bricks open it first
const openBricks = () => window.localStorage.setItem('di.panel.bricks', '1')
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.localStorage.clear() })

const fifty = (liveIndex, over = {}) => {
    const cues = Array.from({ length: 50 }, (_, i) => cue(i, `scene ${i + 1}`))
    return answer({ cues, live: { index: liveIndex, n: 50, running: true, loop: false, autoplay: false, nextIndex: -1, nextInMs: null, by: null, missing: 0 }, ...over })
}
const cards = () => [...document.querySelectorAll('[data-fav]')]

describe('the scene strip', () => {
    it('is ONE small control at first load; a click opens the scenes and the next visit finds them open', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(() => respond(answer()))
        const first = render(<RoomFavourites spaceId="moxir" projectId="v1-1" />)
        const toggle = await screen.findByTestId('room-favourites-toggle')
        expect(cards().length).toBe(0)
        expect(toggle.getAttribute('aria-expanded')).toBe('false')
        expect(parseFloat(toggle.style.borderRadius) || 2).toBeLessThanOrEqual(2)
        fireEvent.click(toggle)
        expect(cards().length).toBe(7) // ALL the scenes (a laser one too), not five favourites
        first.unmount()
        render(<RoomFavourites spaceId="moxir" projectId="v1-1" />)
        await screen.findByTestId('room-favourites-toggle')
        expect(cards().length).toBe(7)
    })

    it('50 scenes are 5 pages of 10; the page of the playing scene opens first and the pager turns', async () => {
        openBricks()
        vi.spyOn(globalThis, 'fetch').mockImplementation(() => respond(fifty(33)))
        render(<RoomFavourites spaceId="moxir" projectId="v1-1" />)
        await screen.findByText('scene 34')
        expect(screen.getByTestId('room-scenes-page').textContent).toBe('4 / 5')
        expect(cards().length).toBe(10)
        expect(cards()[0].getAttribute('data-cue')).toBe('30')
        expect(document.querySelector('[data-cue="33"]').getAttribute('aria-current')).toBe('true')
        expect(cards().filter((b) => b.getAttribute('aria-current') === 'true').length).toBe(1)
        fireEvent.click(screen.getByTestId('room-scenes-next'))
        expect(screen.getByTestId('room-scenes-page').textContent).toBe('5 / 5')
        expect(cards()[0].getAttribute('data-cue')).toBe('40')
        expect(screen.getByTestId('room-scenes-next').disabled).toBe(true)
        fireEvent.click(screen.getByTestId('room-scenes-prev'))
        fireEvent.click(screen.getByTestId('room-scenes-prev'))
        fireEvent.click(screen.getByTestId('room-scenes-prev'))
        fireEvent.click(screen.getByTestId('room-scenes-prev'))
        expect(screen.getByTestId('room-scenes-page').textContent).toBe('1 / 5')
        expect(screen.getByTestId('room-scenes-prev').disabled).toBe(true)
        // away from the playing page the pager says where it is and takes you back; the page you turned to is not snapped away
        fireEvent.click(screen.getByTestId('room-scenes-now'))
        expect(screen.getByTestId('room-scenes-page').textContent).toBe('4 / 5')
        expect(screen.queryByTestId('room-scenes-now')).toBe(null)
    })

    it('where a desk drives the room the playing card is the desk runner\'s scene, not the server feed\'s', async () => {
        openBricks()
        const deskAnswer = { cues: { project: 'moxir-v1-1', index: 12, n: 50, running: true, loop: false, autoplay: false, nextInMs: null, missing: [] } }
        vi.spyOn(globalThis, 'fetch').mockImplementation((url) => respond(String(url).includes('api/cues') ? deskAnswer : fifty(33)))
        render(<RoomFavourites spaceId="moxir" projectId="v1-1" driver="desk" />)
        await screen.findByText('scene 13')
        expect(screen.getByTestId('room-scenes-page').textContent).toBe('2 / 5')
        expect(document.querySelector('[data-cue="12"]').getAttribute('aria-current')).toBe('true')
    })

    it('where the show clock drives the room the playing card is the clock\'s scene, not a stale server runner', async () => {
        openBricks()
        vi.spyOn(globalThis, 'fetch').mockImplementation(() => respond(fifty(49)))
        render(<RoomFavourites spaceId="moxir" projectId="v1-1" driver="clock" playingIndex={33} />)
        await screen.findByText('scene 34')
        expect(screen.getByTestId('room-scenes-page').textContent).toBe('4 / 5')
        expect(cards().filter((b) => b.getAttribute('aria-current') === 'true').map((b) => b.dataset.cue)).toEqual(['33'])
    })

    it('for the editor a click posts the same choose that sends the scene to Light', async () => {
        openBricks()
        const calls = []
        vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => { calls.push([String(url), init]); return respond(answer({ you: { who: 'operator', block: '', authOff: false } })) })
        render(<RoomFavourites spaceId="moxir" projectId="v1-1" />)
        await screen.findByText('the black')
        expect(document.querySelector('[data-fav="rig-l2"]').getAttribute('aria-current')).toBe('true')
        await act(async () => { fireEvent.click(document.querySelector('[data-fav="rig-l3"]')) })
        const post = calls.find(([, init]) => init?.method === 'POST')
        expect(post[0]).toMatch(/\/api\/spaces\/moxir\/show\/v1-1\/choose$/)
        expect(JSON.parse(post[1].body)).toMatchObject({ index: 3, cueId: 'c3' })
    })

    it('on a show that plays by its own clock (the server answers no-light) a click previews that scene for this viewer and posts nothing', async () => {
        openBricks()
        const previewed = vi.fn()
        const calls = []
        vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => { calls.push([String(url), init]); return respond(answer({ clock: { showEpoch: 1, loop: true, showSource: 'clock', cues: [] }, you: { who: 'operator', block: '', authOff: false } })) })
        render(<RoomFavourites spaceId="moxir" projectId="v1-1" driver="clock" playingIndex={2} onPreview={previewed} previewLook="l3" />)
        await screen.findByText('the black')
        expect(document.querySelector('[data-fav="rig-l4"]').disabled).toBe(false)
        expect(document.querySelector('[data-fav="rig-l3"]').getAttribute('aria-pressed')).toBe('true')
        await act(async () => { fireEvent.click(document.querySelector('[data-fav="rig-l4"]')) })
        expect(previewed).toHaveBeenCalledWith('l4')
        expect(calls.some(([, init]) => init?.method === 'POST')).toBe(false)
    })

    it('a visitor the server blocks still previews on a clock show: the preview is this viewer\'s own page and posts nothing (owner 10-15 22:0x)', async () => {
        openBricks()
        const previewed = vi.fn()
        const calls = []
        vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => { calls.push([String(url), init]); return respond(answer({ you: { who: 'visitor', block: 'team-only', authOff: false } })) })
        render(<RoomFavourites spaceId="moxir" projectId="v1-1" driver="clock" playingIndex={2} onPreview={previewed} />)
        await screen.findByText('the black')
        const card = document.querySelector('[data-fav="rig-l4"]')
        expect(card.disabled).toBe(false)
        expect(card.getAttribute('aria-disabled')).toBeNull()
        expect(card.title).toMatch(/preview, for you only/)
        await act(async () => { fireEvent.click(card) })
        expect(previewed).toHaveBeenCalledWith('l4')
        expect(calls.some(([, init]) => init?.method === 'POST')).toBe(false)
    })

    it('a laser scene previews too on a clock show (nothing reaches a device); without a preview it stays operator only', async () => {
        openBricks()
        const previewed = vi.fn()
        vi.spyOn(globalThis, 'fetch').mockImplementation(() => respond(answer({ you: { who: 'operator', block: '', authOff: false } })))
        const { unmount } = render(<RoomFavourites spaceId="moxir" projectId="v1-1" driver="clock" playingIndex={2} onPreview={previewed} />)
        await screen.findByText('the black')
        const card = document.querySelector('[data-fav="rig-l1"]') // 'one line', the fixture's laser scene
        expect(card.disabled).toBe(false)
        await act(async () => { fireEvent.click(card) })
        expect(previewed).toHaveBeenCalledWith('l1')
        unmount()
        render(<RoomFavourites spaceId="moxir" projectId="v1-1" />)
        await screen.findByText('the black')
        expect(document.querySelector('[data-fav="rig-l1"]').disabled).toBe(true)
    })

    it('for a visitor a click does nothing and the card says why on hover', async () => {
        openBricks()
        const calls = []
        vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => { calls.push([String(url), init]); return respond(answer({ you: { who: 'visitor', block: 'team-only', authOff: false } })) })
        render(<RoomFavourites spaceId="moxir" projectId="v1-1" />)
        await screen.findByText('the black')
        const card = document.querySelector('[data-fav="rig-l3"]')
        expect(card.title).toMatch(/the show runs on its own clock/)
        await act(async () => { fireEvent.click(card) })
        expect(calls.some(([, init]) => init?.method === 'POST')).toBe(false)
    })

    it('the audience-plays hook hands a visitor click to the server, which still decides', async () => {
        openBricks()
        const calls = []
        vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => { calls.push([String(url), init]); return respond(answer({ you: { who: 'visitor', block: 'team-only', authOff: false } })) })
        render(<RoomFavourites spaceId="moxir" projectId="v1-1" audiencePlays />)
        await screen.findByText('the black')
        await act(async () => { fireEvent.click(document.querySelector('[data-fav="rig-l3"]')) })
        expect(calls.some(([, init]) => init?.method === 'POST')).toBe(true)
    })

    it('ten scenes are ten cards: one row on a wide screen, two rows of five on a phone', async () => {
        openBricks()
        const cues = Array.from({ length: 10 }, (_, i) => cue(i, `scene ${i + 1}`))
        const a = answer({ cues, live: { index: 0, n: 10, running: true, loop: false, autoplay: false, nextIndex: -1, nextInMs: null, by: null, missing: 0 } })
        vi.spyOn(globalThis, 'fetch').mockImplementation(() => respond(a))
        const mm = (matches) => { window.matchMedia = () => ({ matches, addEventListener() {}, removeEventListener() {} }) }
        mm(true)
        render(<RoomFavourites spaceId="moxir" projectId="v1-1" />)
        await screen.findByText('scene 1')
        expect(cards().length).toBe(10)
        expect(document.querySelector('[aria-label="scenes"]').getAttribute('data-cols')).toBe('10')
        expect(screen.queryByTestId('room-scenes-pager')).toBe(null) // one page: no pager
        cleanup()
        mm(false)
        render(<RoomFavourites spaceId="moxir" projectId="v1-1" />)
        await screen.findByText('scene 1')
        expect(document.querySelector('[aria-label="scenes"]').getAttribute('data-cols')).toBe('5')
        delete window.matchMedia
    })

    it('a laser scene is never tappable', async () => {
        openBricks()
        vi.spyOn(globalThis, 'fetch').mockImplementation(() => respond(answer()))
        render(<RoomFavourites spaceId="moxir" projectId="v1-1" />)
        await screen.findByText('the black')
        expect(document.querySelector('[data-fav="rig-l1"]').disabled).toBe(true)
    })

    it('draws nothing when the show has no scenes', async () => {
        openBricks()
        vi.spyOn(globalThis, 'fetch').mockImplementation(() => respond(answer({ cues: [] })))
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
