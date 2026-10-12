// The show page (RIG_BUILD.md §24) in jsdom: what it SAYS and what it SENDS, against a server
// answer of the shape serverXR/src/routes/showRoutes.js gives (proven on the wire by
// serverXR/src/showContracts.test.js). Not proof it looks right — that is the screenshots.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ShowSurface from './ShowSurface.jsx'

const answer = (over = {}) => ({
    space: { id: 'moxir', label: 'MOXIR' },
    project: { id: 'moxir-v1-0', slug: 'v1-0', title: 'MOXIR v1.0' },
    cues: [
        { index: 0, id: 'c1', name: 'Act 1 · still smoking', act: '1', title: 'still smoking', line: 'holds 20 s', swatch: [{ hex: '#ff3a12', word: 'ember' }], laser: null },
        { index: 1, id: 'c2', name: 'Act 1 · one line', act: '1', title: 'one line', line: 'holds 20 s', swatch: [], laser: 'lit' },
        { index: 2, id: 'c3', name: 'the black', act: null, title: 'the black', line: 'holds 4 s', swatch: [], laser: null }
    ],
    clock: { showEpoch: null, loop: true, showSource: null, cues: [] },
    light: { state: 'open', otherShow: false, otherList: false },
    live: { index: 0, n: 3, running: true, loop: false, autoplay: false, nextIndex: -1, nextInMs: null, by: 'Անի', missing: 0 },
    control: { choosers: 'team', cooldownMs: 10000, cooldownLeftMs: 0, last: null },
    you: { who: 'member', block: '', authOff: false },
    now: Date.now(),
    ...over
})

const respond = (body, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body })

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('the show page', () => {
    it('is a grid of scene buttons: the name, the colours, the live one marked, nothing else', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(() => respond(answer()))
        render(<ShowSurface spaceId="moxir" projectId="v1-0" />)
        const grid = await screen.findByRole('list', { name: 'Scenes' })
        expect(grid.querySelectorAll('button')).toHaveLength(3)
        const live = document.querySelector('[data-cue="0"]')
        expect(live.getAttribute('aria-current')).toBe('true')
        expect(live.textContent).toMatch(/still smoking/)
        expect(live.textContent).toMatch(/live/)
        // no countdown, no "next", no paragraphs of explanation
        expect(document.body.textContent).not.toMatch(/next in|waits for GO|chosen by|\bnext:/)
        // settings are behind one button, for the operator only
        expect(screen.queryByRole('button', { name: 'settings' })).toBe(null)
        expect(screen.queryByRole('radiogroup')).toBe(null)
    })

    it('a laser scene is shown, and nobody can press it', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(() => respond(answer()))
        render(<ShowSurface spaceId="moxir" projectId="v1-0" />)
        const laser = (await screen.findByText('operator only')).closest('button')
        expect(laser.disabled).toBe(true)
        expect(laser.textContent).toMatch(/one line/)
    })

    it('a press sends that scene - index, id and the name typed in settings - and the scene stays marked live', async () => {
        const calls = []
        vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => {
            calls.push([String(url), init])
            if (init?.method === 'POST') return respond(answer({ live: { ...answer().live, index: 2, autoplay: false, nextIndex: -1, nextInMs: null, by: 'Ani' } }))
            return respond(answer({ you: { who: 'operator', block: '', authOff: false } }))
        })
        render(<ShowSurface spaceId="moxir" projectId="v1-0" />)
        await screen.findByRole('list', { name: 'Scenes' })
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'settings' })) })
        fireEvent.change(screen.getByLabelText(/your name/), { target: { value: 'Ani' } })
        await act(async () => { fireEvent.click(document.querySelector('[data-cue="2"]')) })
        const post = calls.find(([, init]) => init?.method === 'POST')
        expect(post[0]).toMatch(/\/api\/spaces\/moxir\/show\/v1-0\/choose$/)
        expect(JSON.parse(post[1].body)).toEqual({ index: 2, cueId: 'c3', name: 'Ani' })
        await waitFor(() => expect(document.querySelector('[data-cue="2"]').getAttribute('aria-current')).toBe('true'))
        expect(document.querySelector('[data-cue="0"]').getAttribute('aria-current')).toBe(null)
    })

    it('a visitor while the team presses: every button is shut and the page says why', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(() => respond(answer({ you: { who: 'visitor', block: 'team-only', authOff: false } })))
        render(<ShowSurface spaceId="moxir" projectId="v1-0" />)
        expect(await screen.findByText(/^You watch\. The team/)).toBeTruthy()
        expect([...document.querySelectorAll('.show-brick__button')].every((b) => b.disabled)).toBe(true)
        expect(screen.queryByRole('radiogroup')).toBe(null)
    })

    it('settings (operator only, one button): who may press, and "play in order" - off unless switched on', async () => {
        const calls = []
        vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => {
            calls.push([String(url), init])
            return respond(answer({ you: { who: 'operator', block: '', authOff: true } }))
        })
        render(<ShowSurface spaceId="moxir" projectId="v1-0" />)
        const open = await screen.findByRole('button', { name: 'settings' })
        expect(screen.queryByRole('radiogroup')).toBe(null)
        await act(async () => { fireEvent.click(open) })
        expect(screen.getByRole('radio', { name: 'team' }).getAttribute('aria-checked')).toBe('true')
        expect(screen.getByText(/Sign-in is off here, so everyone is the operator/)).toBeTruthy()
        expect(screen.getByLabelText('play in order').checked).toBe(false)
        await act(async () => { fireEvent.click(screen.getByRole('radio', { name: 'everyone' })) })
        const control = calls.find(([, init]) => init?.method === 'POST')
        expect(control[0]).toMatch(/\/control$/)
        expect(JSON.parse(control[1].body)).toEqual({ choosers: 'everyone' })
        await act(async () => { fireEvent.click(screen.getByLabelText('play in order')) })
        const auto = calls.filter(([, init]) => init?.method === 'POST')[1]
        expect(auto[0]).toMatch(/\/autoplay$/)
        expect(JSON.parse(auto[1].body)).toEqual({ autoplay: true })
    })

    it('a private show to someone outside it: one sentence, no list', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(() => respond({ error: 'This show is private to its space.' }, 403))
        render(<ShowSurface spaceId="moxir" projectId="v1-0" />)
        expect(await screen.findByRole('alert')).toBeTruthy()
        expect(screen.getByRole('alert').textContent).toBe('This show is private to its space.')
    })

    it('a refusal is one short line and goes after a few seconds', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true })
        try {
            vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => (init?.method === 'POST'
                ? respond({ error: 'Locked by the operator: only the operator chooses now.', code: 'operator-only' }, 423)
                : respond(answer())))
            render(<ShowSurface spaceId="moxir" projectId="v1-0" />)
            await screen.findByRole('list', { name: 'Scenes' })
            await act(async () => { fireEvent.click(document.querySelector('[data-cue="2"]')) })
            expect(screen.getByRole('status').textContent).toMatch(/Locked by the operator/)
            await act(async () => { vi.advanceTimersByTime(6500) })
            expect(screen.queryByRole('status')).toBe(null)
        } finally {
            vi.useRealTimers()
        }
    })
})

describe('the show page — cue-page bug pass 2026-10-09', () => {
    it('a dropped link is a banner at the TOP, and the last list stays', async () => {
        let fail = false
        vi.spyOn(globalThis, 'fetch').mockImplementation(() => (fail ? Promise.reject(new TypeError('offline')) : respond(answer())))
        render(<ShowSurface spaceId="moxir" projectId="v1-0" />)
        await screen.findByRole('list', { name: 'Scenes' })
        fail = true
        await act(async () => { await new Promise((r) => setTimeout(r, 1100)) })
        const banner = await screen.findByRole('alert')
        const main = screen.getByTestId('show-page')
        expect(main.firstElementChild).toBe(banner)
        expect(banner.textContent).toMatch(/old/)
        expect(screen.getAllByRole('listitem')).toHaveLength(3)
    })

    it('with sign-in off it says plainly that everyone is the operator', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(() => respond(answer({ you: { who: 'operator', block: '', authOff: true } })))
        render(<ShowSurface spaceId="moxir" projectId="v1-0" />)
        const opener = await screen.findByRole('button', { name: 'settings' })
        await act(async () => { fireEvent.click(opener) })
        expect(screen.getAllByText(/everyone is the operator/).length).toBeGreaterThan(0)
    })

    it('the person who pressed is told "You pressed X", not "Someone just pressed"', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => (init?.method === 'POST'
            ? respond(answer({ control: { choosers: 'team', cooldownMs: 10000, cooldownLeftMs: 9000, last: null }, you: { who: 'member', block: 'cooldown', authOff: false } }))
            : respond(answer())))
        render(<ShowSurface spaceId="moxir" projectId="v1-0" />)
        await screen.findByRole('list', { name: 'Scenes' })
        await act(async () => { fireEvent.click(document.querySelector('[data-cue="2"]')) })
        expect(await screen.findByText(/You pressed the black — next press in \d+ s/)).toBeTruthy()
    })

    it('an unknown project has a way back and the tab says so', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(() => respond({ error: 'Not found.' }, 404))
        render(<ShowSurface spaceId="moxir" projectId="nope" />)
        expect(await screen.findByText('There is no show at this address.')).toBeTruthy()
        expect(screen.getByRole('link', { name: 'back to the space' })).toBeTruthy()
        expect(document.title).toBe('No show here')
    })

    it('the tab is named after the project', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(() => respond(answer()))
        render(<ShowSurface spaceId="moxir" projectId="v1-0" />)
        await screen.findByRole('list', { name: 'Scenes' })
        expect(document.title).toBe('MOXIR v1.0 — show')
    })
})
