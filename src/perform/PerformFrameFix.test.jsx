import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PerformWindowBody from './PerformWindows.jsx'
import { ShowClockContext } from './useShowClock.js'
import useLightLooks from './useLightLooks.js'
import useLaser from './useLaser.js'
import useSliderSend from './useSliderSend.js'

// A fake machine: GETs answer from `world`, every POST is recorded. No real light or laser is ever asked.
let world
let posts
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const desk = (over = {}) => ({ liveId: null, blackout: false, master: 0.8, follow: { on: false }, looks: [{ id: 'ring', name: 'Ring' }], ...over })

beforeEach(() => {
    posts = []
    world = { desk: desk(), failPost: [] }
    vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
        const path = String(url).replace(/^https?:\/\/[^/]+/, '')
        if (init.method === 'POST') {
            posts.push({ path, body: JSON.parse(init.body) })
            if (world.failPost.some((p) => path.includes(p))) return json({ ok: false }, 500)
            return json({ ok: true })
        }
        if (path === '/laser/api/state') return world.desk ? json({ armed: false, sim: false, cubes: [] }) : Promise.reject(new TypeError('refused'))
        if (path === '/laser/desk/api/state') return world.desk ? json(world.desk) : Promise.reject(new TypeError('refused'))
        return new Response('nope', { status: 404 })
    }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })

const ownLight = { up: true, reachable: true, blackout: false, master: 255, show: 'moxir' }
const ctxWith = (deck = true, spaceId = 'moxir') => ({
    spaceId,
    document: { nodes: deck ? [{ id: 'deck1', typeId: 'vj.deck', values: { deck: { master: 1 } } }] : [] },
    applyLocalOps: vi.fn()
})
const renderMaster = ({ light = ownLight, ctx = ctxWith() } = {}) => render(
    <ShowClockContext.Provider value={{ light, leader: 'deck', timeline: { bpm: 120, epoch: 0 } }}>
        <PerformWindowBody kind="master" ctx={ctx} />
    </ShowClockContext.Provider>
)
const tag = (name) => document.querySelector(`[data-target="${name}"]`).getAttribute('data-state')
const press = (name) => act(async () => { fireEvent.click(screen.getByRole('button', { name })) })
const lightPosts = () => posts.filter((p) => p.path.startsWith('/light/'))
const laserBlackouts = () => posts.filter((p) => p.path === '/laser/desk/api/blackout').map((p) => p.body)

describe('Master with another space’s Light desk', () => {
    const other = { ...ownLight, show: 'platina' }

    it('never sends blackout or master to the light, says "other show", and still blacks out deck and laser', async () => {
        const ctx = ctxWith()
        renderMaster({ light: other, ctx })
        await waitFor(() => expect(tag('laser')).toBe('live'))
        expect(tag('light')).toBe('other')
        expect(document.querySelector('[data-target="light"]').textContent).toMatch(/other show/)
        expect(screen.getByLabelText('Light master').disabled).toBe(true)
        fireEvent.change(screen.getByLabelText('Light master'), { target: { value: '10' } })
        await press('Blackout')
        expect(ctx.applyLocalOps).toHaveBeenCalledTimes(1)
        expect(laserBlackouts()).toEqual([{ on: true }])
        expect(lightPosts()).toEqual([])
        await press('Blackout · on')
        expect(lightPosts()).toEqual([])
    })

    it('with its own show it sends to the space-keyed path, for blackout, lift and master', async () => {
        renderMaster()
        await waitFor(() => expect(tag('laser')).toBe('live'))
        await press('Blackout')
        expect(lightPosts()).toEqual([{ path: '/light/space/moxir/api/master', body: { blackout: true } }])
        await press('Blackout · on')
        expect(lightPosts().at(-1)).toEqual({ path: '/light/space/moxir/api/master', body: { blackout: false } })
        fireEvent.change(screen.getByLabelText('Light master'), { target: { value: '51' } })
        await waitFor(() => expect(lightPosts().at(-1).body).toEqual({ master: 51 }))
        expect(lightPosts().every((p) => p.path === '/light/space/moxir/api/master')).toBe(true)
    })
})

describe('blackout survives a reload (level kept in the document)', () => {
    const patchOf = (ctx, i) => ctx.applyLocalOps.mock.calls[i][0].payload.patch.values

    it('blackout stores the level in the deck node values', async () => {
        const ctx = ctxWith()
        ctx.document.nodes[0].values.deck.master = 0.6
        renderMaster({ ctx })
        await waitFor(() => expect(tag('laser')).toBe('live'))
        await press('Blackout')
        expect(patchOf(ctx, 0).blackoutRestore).toBe(0.6)
        expect(patchOf(ctx, 0).deck.master).toBe(0)
    })

    it('a page loaded with deck master 0 and a stored level restores it with ONE press', async () => {
        const ctx = ctxWith()
        ctx.document.nodes[0].values = { deck: { master: 0 }, blackoutRestore: 0.6 }
        renderMaster({ ctx })
        await waitFor(() => expect(tag('laser')).toBe('live'))
        await press('Blackout · on')
        expect(ctx.applyLocalOps).toHaveBeenCalledTimes(1)
        expect(patchOf(ctx, 0).deck.master).toBe(0.6)
        expect(patchOf(ctx, 0).blackoutRestore).toBeUndefined()
    })
})

describe('the laser desk is machine-wide, and says so', () => {
    it('shows a short word next to the LASER tag with the reason in its title, and in the Laser block', async () => {
        renderMaster()
        await waitFor(() => expect(tag('laser')).toBe('live'))
        const laserTag = document.querySelector('[data-target="laser"]')
        expect(laserTag.textContent).toMatch(/machine-wide/i)
        expect(laserTag.getAttribute('title')).toMatch(/no show key/)
        cleanup()
        render(<PerformWindowBody kind="laser" ctx={ctxWith()} />)
        expect(await screen.findByText('MACHINE-WIDE')).toBeTruthy()
    })
})

describe('blackout state honesty', () => {
    it('a failed laser POST: no "set here" flag, tag says failed, next press retries only the laser', async () => {
        world.failPost = ['/laser/']
        const ctx = ctxWith()
        renderMaster({ ctx })
        await waitFor(() => expect(tag('laser')).toBe('live'))
        await press('Blackout')
        expect((await screen.findByRole('alert')).textContent).toMatch(/LASER/)
        expect(tag('laser')).toBe('failed')
        world.failPost = []
        const before = posts.length
        await press('Blackout · on')
        expect(posts.slice(before)).toEqual([{ path: '/laser/desk/api/blackout', body: { on: true } }])
        expect(ctx.applyLocalOps).toHaveBeenCalledTimes(1) // deck neither lifted nor re-sent
        expect(screen.queryByRole('alert')).toBeNull()
        // the flag is set now, so the next press lifts it
        await press('Blackout · on')
        expect(laserBlackouts().at(-1)).toEqual({ on: false })
    })

    it('a failed lift keeps the flag and a second press lifts it again', async () => {
        renderMaster()
        await waitFor(() => expect(tag('laser')).toBe('live'))
        await press('Blackout')
        world.failPost = ['/laser/']
        await press('Blackout · on')
        expect(tag('laser')).toBe('failed')
        expect(screen.getByRole('alert').textContent).toMatch(/LASER/)
        world.failPost = []
        await press('Blackout · on')
        expect(laserBlackouts()).toEqual([{ on: true }, { on: false }, { on: false }])
        expect(screen.queryByRole('alert')).toBeNull()
    })

    it('light only, no deck, no laser: sends the light, is on only after its yes, and lifts it', async () => {
        world.desk = null
        renderMaster({ ctx: ctxWith(false) })
        await waitFor(() => expect(tag('laser')).toBe('absent'))
        expect(tag('picture')).toBe('absent')
        await press('Blackout')
        expect(lightPosts()).toEqual([{ path: '/light/space/moxir/api/master', body: { blackout: true } }])
        expect(screen.getByRole('button', { name: 'Blackout · on' })).toBeTruthy()
        await press('Blackout · on')
        expect(lightPosts().at(-1).body).toEqual({ blackout: false })
    })

    it('a failed light POST is not shown as black', async () => {
        world.desk = null
        world.failPost = ['/light/']
        renderMaster({ ctx: ctxWith(false) })
        await press('Blackout')
        expect(tag('light')).toBe('failed')
    })
})

describe('one poll loop per enabled period', () => {
    const flush = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }

    it('useLightLooks: enabled true, false, true while a read is in flight leaves one loop', async () => {
        vi.useFakeTimers()
        const releases = []
        const read = vi.fn(() => new Promise((resolve) => { releases.push(() => resolve({ state: 'own', looks: [], liveId: null, master: null, blackout: false })) }))
        const { rerender } = renderHook(({ enabled }) => useLightLooks({ spaceId: 's', enabled, pollMs: 1000, read }), { initialProps: { enabled: true } })
        expect(read).toHaveBeenCalledTimes(1)
        rerender({ enabled: false })
        rerender({ enabled: true })
        expect(read).toHaveBeenCalledTimes(2)
        await act(async () => { releases.forEach((r) => r()) })
        read.mockClear()
        read.mockImplementation(async () => ({ state: 'own', looks: [], liveId: null, master: null, blackout: false }))
        await flush(1000)
        expect(read).toHaveBeenCalledTimes(1) // two loops would be 2
        await flush(3000)
        expect(read).toHaveBeenCalledTimes(4)
    })

    it('useLaser: unmount and remount while a read is in flight leaves one loop', async () => {
        vi.useFakeTimers()
        const gets = () => fetch.mock.calls.filter(([url]) => String(url).endsWith('/laser/api/state')).length
        const a = renderHook(() => useLaser({ pollMs: 1000 }))
        a.unmount()
        renderHook(() => useLaser({ pollMs: 1000 }))
        await flush(0)
        const base = gets()
        await flush(3000)
        expect(gets() - base).toBe(3)
    })
})

describe('useSliderSend', () => {
    it('100 changes make few requests, the last value goes last, the thumb stays on the local value', async () => {
        const sent = []
        let release = []
        const send = (v) => new Promise((resolve) => { sent.push(v); release.push(resolve) })
        const { result } = renderHook(() => useSliderSend(send))
        act(() => { for (let i = 1; i <= 100; i += 1) result.current.push(i) })
        expect(sent).toEqual([1])
        expect(result.current.local).toBe(100)
        await act(async () => { release.shift()() })
        expect(sent).toEqual([1, 100])
        expect(result.current.local).toBe(100)
        // a late reply of the first request cannot move the thumb: nothing else is read from replies
        act(() => result.current.release())
        expect(result.current.local).toBe(100) // still one in flight: not handed back yet
        await act(async () => { release.shift()() })
        expect(result.current.local).toBe(null)
        expect(sent).toEqual([1, 100])
    })

    it('a failing send does not stop the queue', async () => {
        const sent = []
        const send = vi.fn(async (v) => { sent.push(v); throw new Error('down') })
        const { result } = renderHook(() => useSliderSend(send))
        await act(async () => { result.current.push(1); result.current.push(2) })
        expect(sent).toEqual([1, 2])
    })
})
