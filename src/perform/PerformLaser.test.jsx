import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PerformWindowBody from './PerformWindows.jsx'
import { ShowClockContext } from './useShowClock.js'
import { BUILT_IN_PRESETS, WINDOW_KINDS } from './presets.js'
import { fireCue } from '../map/cueFiring.js'
import { normalizeMappingCue } from '../shared/projectSchema.js'

// A fake machine: GETs answer from `world`, every POST is recorded. No real laser or light is ever asked.
let world
let posts
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const engine = (over = {}) => ({ armed: false, sim: false, cubes: [{ id: 'a', connected: true }, { id: 'b', connected: false }, { id: 'c', connected: true }], ...over })
const desk = (over = {}) => ({ live: null, liveId: 'star', blackout: false, master: 0.8, follow: { on: false }, looks: [{ id: 'ring', name: 'Ring' }, { id: 'star', name: 'Star' }], ...over })

beforeEach(() => {
    posts = []
    world = { engine: engine(), desk: desk(), failPost: [] }
    vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
        const path = String(url).replace(/^https?:\/\/[^/]+/, '')
        if (init.method === 'POST') {
            posts.push({ path, body: JSON.parse(init.body) })
            if (world.failPost.some((p) => path.includes(p))) return json({ ok: false }, 500)
            return json({ ok: true })
        }
        if (path === '/laser/api/state') return world.engine ? json(world.engine) : Promise.reject(new TypeError('refused'))
        if (path === '/laser/desk/api/state') return world.desk ? json(world.desk) : Promise.reject(new TypeError('refused'))
        return new Response('nope', { status: 404 })
    }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const ctxWith = (deck = true) => ({
    document: { nodes: deck ? [{ id: 'deck1', typeId: 'vj.deck', values: { deck: { master: 1 } } }] : [] },
    applyLocalOps: vi.fn()
})
const renderLaser = () => render(<PerformWindowBody kind="laser" ctx={ctxWith()} />)
const renderMaster = ({ light = { up: true, reachable: true, blackout: false, master: 255 }, deck = true, ctx = ctxWith(deck) } = {}) => render(
    <ShowClockContext.Provider value={{ light, leader: 'deck', timeline: { bpm: 120, epoch: 0 } }}>
        <PerformWindowBody kind="master" ctx={ctx} />
    </ShowClockContext.Provider>
)

describe('the laser window', () => {
    it('says how many cubes are connected of how many, and armed yes/no, read only', async () => {
        renderLaser()
        expect(await screen.findByText('2/3 CUBES · NOT ARMED')).toBeTruthy()
        expect(screen.getByText('Laser page').getAttribute('title')).toBe('Arm on the Laser page')
        expect(screen.getByText('Laser page').getAttribute('href')).toBe('/laser/')
    })

    it('has no arm control anywhere in the DOM, and nothing it renders ever posts to /laser/api/arm', async () => {
        const { container } = renderLaser()
        await screen.findByText(/CUBES/)
        expect(container.querySelector('button[aria-label*="rm" i]')).toBeNull()
        for (const button of container.querySelectorAll('button')) expect(button.textContent).not.toMatch(/^arm/i)
        fireEvent.click(container.querySelector('[data-look="ring"]'))
        await waitFor(() => expect(posts.length).toBeGreaterThan(0))
        expect(posts.some((p) => p.path.includes('arm'))).toBe(false)
    })

    it('shows ARMED without the Laser page link', async () => {
        world.engine = engine({ armed: true })
        renderLaser()
        expect(await screen.findByText('2/3 CUBES · ARMED')).toBeTruthy()
        expect(screen.queryByText('Laser page')).toBeNull()
    })

    it('lists the desk looks, marks the live one, and a press calls the desk Go endpoint', async () => {
        const { container } = renderLaser()
        await screen.findByText('Ring')
        expect(container.querySelector('[data-look="star"]').className).toContain('is-live')
        expect(container.querySelector('[data-look="ring"]').className).not.toContain('is-live')
        fireEvent.click(container.querySelector('[data-look="ring"]'))
        await waitFor(() => expect(posts).toEqual([{ path: '/laser/desk/api/go', body: { look: 'ring' } }]))
    })

    it('says so plainly when the desk has no looks', async () => {
        world.desk = desk({ looks: [] })
        renderLaser()
        expect(await screen.findByText('NO LOOKS')).toBeTruthy()
        expect(screen.getByText('Laser desk').getAttribute('title')).toBe('Make one on the Laser desk')
        expect(screen.getByText('Laser desk').getAttribute('href')).toBe('/laser/desk/')
    })

    it('master slider and follow-light toggle use the desk endpoints', async () => {
        renderLaser()
        const slider = await screen.findByLabelText('Laser master')
        fireEvent.change(slider, { target: { value: '0.5' } })
        fireEvent.click(screen.getByLabelText('Laser follows Light'))
        await waitFor(() => expect(posts).toEqual([
            { path: '/laser/desk/api/master', body: { level: 0.5 } },
            { path: '/laser/desk/api/follow', body: { on: true } }
        ]))
    })

    it('one calm line when the engine cannot be reached', async () => {
        world.engine = null
        world.desk = null
        renderLaser()
        expect(await screen.findByText('NO LASER ENGINE')).toBeTruthy()
    })

    it('a page that answers HTML (a hosted tier) is "not on this machine", not an error', async () => {
        fetch.mockImplementation(async () => new Response('<html></html>', { status: 200, headers: { 'Content-Type': 'text/html' } }))
        renderLaser()
        expect(await screen.findByText('NO LASER ENGINE')).toBeTruthy()
    })
})

describe('blackout for picture, light and laser', () => {
    const tag = (name) => document.querySelector(`[data-target="${name}"]`).getAttribute('data-state')

    it('sends all three, and the tags show the real state', async () => {
        const ctx = ctxWith()
        renderMaster({ ctx })
        await waitFor(() => expect(tag('laser')).toBe('live'))
        expect(tag('picture')).toBe('live')
        expect(tag('light')).toBe('live')
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Blackout' })) })
        expect(ctx.applyLocalOps).toHaveBeenCalledTimes(1)
        expect(posts).toEqual([
            { path: '/light/api/master', body: { blackout: true } },
            { path: '/laser/desk/api/blackout', body: { on: true } }
        ])
    })

    it('a laser failure does not stop the others, and the failed one is named', async () => {
        world.failPost = ['/laser/']
        const ctx = ctxWith()
        renderMaster({ ctx })
        await waitFor(() => expect(tag('laser')).toBe('live'))
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Blackout' })) })
        expect(ctx.applyLocalOps).toHaveBeenCalledTimes(1)
        expect(posts.some((p) => p.path === '/light/api/master')).toBe(true)
        expect((await screen.findByRole('alert')).textContent).toMatch(/LASER/)
        expect(screen.getByRole('alert').textContent).not.toMatch(/LIGHT/)
    })

    it('release lifts the laser blackout when this page set it, and never touches arm', async () => {
        renderMaster()
        await waitFor(() => expect(tag('laser')).toBe('live'))
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Blackout' })) })
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Blackout · on' })) })
        expect(posts.filter((p) => p.path === '/laser/desk/api/blackout').map((p) => p.body)).toEqual([{ on: true }, { on: false }])
        expect(posts.some((p) => p.path.includes('arm'))).toBe(false)
    })

    it('release leaves a laser blackout alone when it was already on before this page pressed', async () => {
        world.desk = desk({ blackout: true })
        renderMaster({ light: { up: true, reachable: true, blackout: false, master: 255 } })
        await waitFor(() => expect(tag('laser')).toBe('black'))
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Blackout' })) })
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Blackout · on' })) })
        expect(posts.filter((p) => p.path === '/laser/desk/api/blackout').map((p) => p.body)).toEqual([{ on: true }])
    })

    it('with no laser and no light the laser tag is absent and only the deck is dark', async () => {
        world.engine = null
        world.desk = null
        const ctx = ctxWith()
        renderMaster({ light: { up: false, reachable: false }, ctx })
        await waitFor(() => expect(tag('laser')).toBe('absent'))
        expect(tag('light')).toBe('absent')
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Blackout' })) })
        expect(posts).toEqual([])
        expect(ctx.applyLocalOps).toHaveBeenCalledTimes(1)
    })
})

describe('one go: a cue carries a laser look', () => {
    it('is kept by the schema only when set, so old cues are unchanged', () => {
        expect(normalizeMappingCue({ id: 'c', laserLook: ' ring '.trim() }).laserLook).toBe('ring')
        expect('laserLook' in normalizeMappingCue({ id: 'c', lightLook: 'x' })).toBe(false)
    })

    it('fires the light first, then the laser look, then the document ops', async () => {
        const order = []
        fetch.mockImplementation(async (url, init) => { order.push(String(url).replace(/^https?:\/\/[^/]+/, '')); return json({ ok: true }) })
        fireCue({ id: 'c', fade: 0, surfaces: {}, lightLook: 'lk', laserLook: 'ring' }, () => order.push('ops'))
        await waitFor(() => expect(order).toContain('/laser/desk/api/go'))
        expect(order.indexOf('/light/api/looks/fire')).toBeLessThan(order.indexOf('/laser/desk/api/go'))
        expect(order).toContain('ops')
    })

    it('a cue with no laser look never touches the laser', () => {
        fireCue({ id: 'c', fade: 0, surfaces: {} }, () => {})
        expect(fetch).not.toHaveBeenCalled()
    })
})

describe('the Show preset and the laser kind', () => {
    it('is a native phase-1 kind in the catalogue', () => {
        expect(WINDOW_KINDS.laser.phase).toBe(1)
    })

    it('Show has deck, master, cues, clock, laser with no overlapping rects, wide and narrow', () => {
        const show = BUILT_IN_PRESETS.find((p) => p.id === 'show')
        expect(show.windows.map((w) => w.kind).sort()).toEqual(['clock', 'cues', 'deck', 'laser', 'lightlooks', 'master'])
        const hit = (a, b) => a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1]
        for (const layout of [show.wide, show.narrow]) {
            const rects = Object.values(layout)
            for (let i = 0; i < rects.length; i += 1) for (let j = i + 1; j < rects.length; j += 1) expect(hit(rects[i], rects[j])).toBe(false)
        }
    })
})
