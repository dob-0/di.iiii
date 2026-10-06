import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProjectStoreState } from '../project/state/projectStore.js'

// A reader never writes (2026-10-01, MOXIR): opening a rig page with the desk on this
// machine used to POST /light/api/rig/patch {prune:true, …every lamp} 400 ms after mount
// and write the desk's answer (index/universe/address/mode) into the document — so a
// visit, a refresh or a second viewer rewrote the desk's patch and the show. Here the
// real useRigAutoPatch runs inside the real pages with a desk present; only the network
// and the document sync are stubbed.

const sent = vi.hoisted(() => ({ ops: [], requests: [] }))
const doc = vi.hoisted(() => ({ value: null }))

vi.mock('../project/hooks/useProjectDocumentSync.js', () => ({
    useProjectDocumentSync: () => ({ applyLocalOps: (ops) => { sent.ops.push(...[].concat(ops)) } })
}))
vi.mock('../project/state/projectStore.js', async (importOriginal) => {
    const real = await importOriginal()
    return { ...real, useProjectStore: () => ({ state: { ...real.createProjectStoreState({}), document: doc.value, hasLoaded: true, selectedEntityIds: [] }, dispatch: () => {} }) }
})
// The desk is here.
vi.mock('../rigMirror/useLightingMirror.js', async (importOriginal) => {
    const real = await importOriginal()
    const mirror = { getSnapshot: () => ({ present: true }), subscribe: () => () => {}, probe: async () => true, watch: () => () => {} }
    return { ...real, getSharedLightingMirror: () => mirror }
})
vi.mock('../map/lightingLink.js', async (importOriginal) => ({
    ...(await importOriginal()),
    probeLightingDesk: () => Promise.resolve(true)
}))
vi.mock('./cueRun.js', async (importOriginal) => {
    const real = await importOriginal()
    const quiet = () => Promise.resolve(null)
    return { ...real, deskCues: { read: quiet, load: quiet, go: quiet, back: quiet, stop: quiet, loop: quiet } }
})
vi.mock('./RigSteps.jsx', () => ({ default: () => null }))
vi.mock('../hooks/useLocalInstall.js', () => ({ default: () => ({ isLocal: true }) }))

const lamp = (id, address) => ({
    id,
    type: 'spotLight',
    name: `UP-B380F ${id}`,
    components: { fixture: { type: 'up-b380f', ...(address ? { mode: '16ch', universe: 1, address, index: address } : {}) } }
})
const show = { id: 'rig-show', type: 'group', name: 'show', components: { rigLooks: { looks: [{ id: 'white', title: 'White' }] } } }

const json = (body) => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body) })
const patchPosts = () => sent.requests.filter((r) => r.method === 'POST' && r.url.includes('rig/patch'))
// Past the auto-patch debounce (400 ms) and the desk probes.
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 700)) })

beforeEach(() => {
    sent.ops.length = 0
    sent.requests.length = 0
    // One lamp patched, one not (as MOXIR's imported ground was): the old mount-patch
    // wrote an address into the second and pruned anything else of the project's.
    doc.value = { ...createProjectStoreState({}).document, entities: [lamp('a', 1), lamp('b'), show], mappingState: { cues: [] } }
    vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
        const method = (init.method || 'GET').toUpperCase()
        sent.requests.push({ method, url: String(url) })
        if (String(url).includes('rig/patch')) return json({ ok: true, assignments: [{ key: 'hall:b', index: 2, universe: 1, address: 17, footprint: 16, how: 'created' }], flags: [], removed: [] })
        if (String(url).includes('api/rig?')) return json({ fixtures: [{ id: 1 }, { id: 2 }] })
        return json({})
    }))
    vi.stubGlobal('ResizeObserver', undefined)
})
afterEach(() => { vi.unstubAllGlobals() })

// The plot mounts a three.js room; a cold import of it takes seconds on a laptop.
const SLOW = 30000

describe('opening a rig page writes nothing', () => {
    it.each([
        ['cards', () => import('./CardsSurface.jsx')],
        ['equipment', () => import('./EquipmentSurface.jsx')],
        ['plot', () => import('./PlotSurface.jsx')]
    ])('the %s page, with a desk here, neither patches the desk nor writes the document', async (_name, load) => {
        const { default: Surface } = await load()
        render(<Surface spaceId="moxir" projectId="hall" />)
        await settle()
        expect(patchPosts()).toEqual([])
        expect(sent.ops).toEqual([])
    }, SLOW)
})

describe('patching is asked for', () => {
    it('the plot: "patch the room on the desk" patches every lamp and writes the answer back', async () => {
        const { default: PlotSurface } = await import('./PlotSurface.jsx')
        render(<PlotSurface spaceId="moxir" projectId="hall" />)
        await settle()
        await act(async () => { fireEvent.click(await screen.findByRole('button', { name: 'patch the room on the desk' })) })
        await settle()
        expect(patchPosts()).toHaveLength(1)
        expect(sent.ops).toEqual([{ type: 'updateComponent', payload: { entityId: 'b', component: 'fixture', patch: { index: 2, universe: 1, address: 17, mode: '16ch' } } }])
    }, SLOW)

    it('the cards: "send looks to the desk" patches the room first, so the looks have fixtures', async () => {
        const { default: CardsSurface } = await import('./CardsSurface.jsx')
        render(<CardsSurface spaceId="moxir" projectId="hall" />)
        await settle()
        await act(async () => { fireEvent.click(await screen.findByRole('button', { name: /^send looks to the desk/ })) })
        await settle()
        const posts = sent.requests.filter((r) => r.method === 'POST').map((r) => r.url.replace(/^.*\/api\//, 'api/'))
        expect(posts.slice(0, 2)).toEqual(['api/rig/patch', 'api/looks/add'])
    }, SLOW)
})
