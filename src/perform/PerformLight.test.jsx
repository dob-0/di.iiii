import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PerformWindowBody from './PerformWindows.jsx'
import { ShowClockContext } from './useShowClock.js'
import { lightRelation } from '../map/lightingLink.js'

// A fake machine: GETs answer from `world`, POSTs are recorded. No real desk is asked.
let world
let posts
let gets
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
    posts = []
    gets = []
    world = {
        status: 200,
        fireable: { looks: [{ id: 'warm', name: 'Warm' }, { id: 'cold', name: 'Cold' }] },
        summary: { layers: [{ id: 'cue', on: true, lookId: 'cold' }], master: 128, blackout: false }
    }
    vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
        const path = String(url).replace(/^https?:\/\/[^/]+/, '')
        if (init.method === 'POST') { posts.push({ path, body: JSON.parse(init.body) }); return json({ ok: true }) }
        gets.push(path)
        if (world.status !== 200) return json({ error: 'other-show' }, world.status)
        if (path.endsWith('/api/fireable')) return json(world.fireable)
        if (path.endsWith('/api/summary')) return json(world.summary)
        return new Response('nope', { status: 404 })
    }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const renderLight = (light, spaceId = 'moxir') => render(
    <ShowClockContext.Provider value={{ light, leader: 'deck', timeline: { bpm: 120, epoch: 0 } }}>
        <PerformWindowBody kind="lightlooks" ctx={{ spaceId, document: { nodes: [] }, applyLocalOps: vi.fn() }} />
    </ShowClockContext.Provider>
)

describe('lightRelation: why "Light desk is not open" can show for a project whose clock says up', () => {
    it('says which of four it is', () => {
        expect(lightRelation({ up: true, reachable: true, show: 'moxir' }, 'moxir')).toBe('own')
        expect(lightRelation({ up: true, reachable: true, show: 'moxir' }, 'platina')).toBe('other')
        expect(lightRelation({ up: false, reachable: true }, 'moxir')).toBe('closed')
        expect(lightRelation({ up: false, reachable: false }, 'moxir')).toBe('off')
        expect(lightRelation({ up: true, reachable: true }, 'moxir')).toBe('own')
    })
})

describe('the light block', () => {
    it('lists the desk looks, marks the live one, and a press fires that look', async () => {
        const { container } = renderLight({ up: true, reachable: true, show: 'moxir' })
        await screen.findByText('Warm')
        expect(container.querySelector('[data-look="cold"]').className).toContain('is-live')
        expect(container.querySelector('[data-look="warm"]').className).not.toContain('is-live')
        fireEvent.click(container.querySelector('[data-look="warm"]'))
        await waitFor(() => expect(posts.map((p) => p.body)).toContainEqual({ id: 'warm' }))
    })

    it('the light master slider posts a 0..255 master', async () => {
        renderLight({ up: true, reachable: true, show: 'moxir' })
        fireEvent.change(await screen.findByLabelText('Light desk master'), { target: { value: '0.5' } })
        await waitFor(() => expect(posts.map((p) => p.body)).toContainEqual({ master: 128 }))
    })

    it('another space’s show: one calm line in four words, and the desk is never asked', async () => {
        const { container } = renderLight({ up: true, reachable: true, show: 'moxir' }, 'platina')
        expect(await screen.findByText('LIGHT: OTHER SHOW')).toBeTruthy()
        expect(container.querySelector('[data-light="other"]')).toBeTruthy()
        expect(gets).toEqual([])
        expect(posts).toEqual([])
    })

    it('no desk here, or one not open: one calm line, nothing asked', async () => {
        renderLight({ up: false, reachable: false })
        expect(await screen.findByText('NO LIGHT DESK')).toBeTruthy()
        cleanup()
        renderLight({ up: false, reachable: true })
        expect(await screen.findByText('LIGHT DESK OFF')).toBeTruthy()
        expect(gets).toEqual([])
    })

    it('a desk that answers 409 for this space is "other show", not an error', async () => {
        world.status = 409
        renderLight({ up: true, reachable: true, show: 'platina' }, 'platina')
        expect(await screen.findByText('LIGHT: OTHER SHOW')).toBeTruthy()
    })
})
