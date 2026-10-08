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
    live: { index: 0, n: 3, running: true, loop: true, nextIndex: 1, nextInMs: 12000, by: 'Անի', missing: 0 },
    control: { choosers: 'team', cooldownMs: 10000, cooldownLeftMs: 0, last: null },
    you: { who: 'member', block: '', authOff: false },
    now: Date.now(),
    ...over
})

const respond = (body, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body })

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('the show page', () => {
    it('shows the live cue, what is next, who chose it, and every cue as a card under its act', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(() => respond(answer()))
        render(<ShowSurface spaceId="moxir" projectId="v1-0" />)
        expect(await screen.findByRole('heading', { level: 1, name: 'still smoking' })).toBeTruthy()
        expect(screen.getByText(/chosen by Անի/)).toBeTruthy()
        expect(screen.getByText('one line', { selector: 'b' })).toBeTruthy()
        expect(screen.getByRole('heading', { level: 2, name: 'act 1' })).toBeTruthy()
        expect(screen.getAllByRole('listitem')).toHaveLength(3)
        expect(screen.getByRole('link', { name: 'see the room' }).getAttribute('href')).toMatch(/\/moxir\/v1-0$/)
    })

    it('a laser moment is a card nobody can tap, and says so', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(() => respond(answer()))
        render(<ShowSurface spaceId="moxir" projectId="v1-0" />)
        const laser = (await screen.findByText('laser moment — operator only')).closest('button')
        expect(laser.disabled).toBe(true)
    })

    it('a tap sends that cue — index, id and the name typed here — and shows the answer', async () => {
        const calls = []
        vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => {
            calls.push([String(url), init])
            if (init?.method === 'POST') return respond(answer({ live: { ...answer().live, index: 2, nextIndex: 0, by: 'Ani' } }))
            return respond(answer())
        })
        render(<ShowSurface spaceId="moxir" projectId="v1-0" />)
        await screen.findByRole('heading', { level: 1 })
        fireEvent.change(screen.getByLabelText(/your name/), { target: { value: 'Ani' } })
        await act(async () => { fireEvent.click(document.querySelector('[data-cue="2"]')) })
        const post = calls.find(([, init]) => init?.method === 'POST')
        expect(post[0]).toMatch(/\/api\/spaces\/moxir\/show\/v1-0\/choose$/)
        expect(JSON.parse(post[1].body)).toEqual({ index: 2, cueId: 'c3', name: 'Ani' })
        await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'the black' })).toBeTruthy())
    })

    it('a visitor while the team chooses: every card is shut and the page says why', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(() => respond(answer({ you: { who: 'visitor', block: 'team-only', authOff: false } })))
        render(<ShowSurface spaceId="moxir" projectId="v1-0" />)
        expect(await screen.findByText(/^You watch\. The team/)).toBeTruthy()
        expect([...document.querySelectorAll('.show-cue__button')].every((b) => b.disabled)).toBe(true)
        expect(screen.queryByRole('radiogroup')).toBe(null)
    })

    it('the operator sets who may choose; nobody else sees the setting', async () => {
        const calls = []
        vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => {
            calls.push([String(url), init])
            return respond(answer({ you: { who: 'operator', block: '', authOff: true } }))
        })
        render(<ShowSurface spaceId="moxir" projectId="v1-0" />)
        const everyone = await screen.findByRole('radio', { name: 'everyone' })
        expect(screen.getByRole('radio', { name: 'team' }).getAttribute('aria-checked')).toBe('true')
        expect(screen.getByText(/Sign-in is off on this di\.iiii/, { selector: 'p' })).toBeTruthy()
        expect(screen.getByText('sign-in is off here — read this')).toBeTruthy()
        await act(async () => { fireEvent.click(everyone) })
        const post = calls.find(([, init]) => init?.method === 'POST')
        expect(post[0]).toMatch(/\/control$/)
        expect(JSON.parse(post[1].body)).toEqual({ choosers: 'everyone' })
    })

    it('a private show to someone outside it: one sentence, no list', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(() => respond({ error: 'This show is private to its space.' }, 403))
        render(<ShowSurface spaceId="moxir" projectId="v1-0" />)
        expect(await screen.findByRole('alert')).toBeTruthy()
        expect(screen.getByRole('alert').textContent).toBe('This show is private to its space.')
    })
})
