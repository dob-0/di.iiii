import { describe, expect, it, vi, afterEach } from 'vitest'
import { act, render, renderHook, waitFor } from '@testing-library/react'
import { useRigLookEntities } from './useRigLook.js'
import RoomLookFollower from './RoomLookFollower.jsx'
import { NOT_PLAYING } from './laserShowState.js'

// Hosted playback (RIG_BUILD.md §16): who drives the room, tested through the real hook
// with a stand-in desk store.

const EPOCH = Date.UTC(2026, 8, 28, 20, 0, 0)
const entities = [{ id: 'rig-looks', components: { rigLooks: { looks: [{ id: 'one-beam', rules: [] }, { id: 'red-room', rules: [] }] } } }]
const documentWith = (mapping) => ({ entities, mappingState: { cues: [], ...mapping } })
const SHOW = {
    showEpoch: EPOCH,
    loop: true,
    cues: [
        { id: 'c1', name: 'One beam', lightLook: 'rig-one-beam', hold: 10, fade: 0, surfaces: {} },
        { id: 'c2', name: 'Red room', lightLook: 'rig-red-room', hold: 10, fade: 2, surfaces: {} }
    ]
}

const fakeDesk = ({ present, looks = [] }) => {
    const snapshot = present ? { present: true, fixtures: [], looks, lookFade: null } : { present: false, fixtures: [] }
    return {
        getSnapshot: () => snapshot,
        subscribe: () => () => {},
        probe: () => Promise.resolve(present),
        watch: () => () => {}
    }
}

afterEach(() => { vi.useRealTimers(); window.localStorage.clear() })

describe('hosted playback — who drives the room', () => {
    it('with no desk, the show\'s clock picks the look from the wall clock', async () => {
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(EPOCH + 12000) // 12 s in: cue 2
        const { result } = renderHook(() => useRigLookEntities(documentWith(SHOW), { mirror: fakeDesk({ present: false }) }))
        await waitFor(() => expect(result.current.driver).toBe('clock'))
        expect(result.current.lookId).toBe('red-room')
        expect(result.current.clock).toMatchObject({ index: 1, name: 'Red room' })
    })

    it('where a desk answers, the desk drives — even when the document carries a show', async () => {
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(EPOCH + 12000)
        const { result } = renderHook(() => useRigLookEntities(documentWith(SHOW), { mirror: fakeDesk({ present: true, looks: ['rig-one-beam'] }) }))
        await waitFor(() => expect(result.current.driver).toBe('desk'))
        expect(result.current.lookId).toBe('one-beam')
        expect(result.current.clock).toBe(null)
    })

    it('a page\'s own GO wins over both', async () => {
        const { result } = renderHook(() => useRigLookEntities(documentWith(SHOW), { explicit: 'one-beam', mirror: fakeDesk({ present: false }) }))
        expect(result.current.driver).toBe('explicit')
        expect(result.current.lookId).toBe('one-beam')
    })

    it('with no show in the document and no desk, the room stays as saved', async () => {
        const { result } = renderHook(() => useRigLookEntities(documentWith({}), { mirror: fakeDesk({ present: false }) }))
        await waitFor(() => expect(result.current.driver).toBe('document'))
        expect(result.current.lookId).toBe('')
    })

    it('moves on to the next cue by itself when its hold runs out', async () => {
        vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
        vi.setSystemTime(EPOCH + 9000) // cue 1, 1 s to go
        const { result } = renderHook(() => useRigLookEntities(documentWith(SHOW), { mirror: fakeDesk({ present: false }) }))
        await act(async () => { await Promise.resolve(); await Promise.resolve() })
        expect(result.current.lookId).toBe('one-beam')
        await act(async () => { vi.advanceTimersByTime(1100) })
        expect(result.current.lookId).toBe('red-room')
    })
})

describe('the show chip', () => {
    it('names the look on; closed at first load, one click lists every look of the loop, and this viewer keeps it open', async () => {
        window.localStorage.clear()
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(EPOCH + 12000)
        const onEntities = vi.fn()
        // RoomLookFollower reads the page's shared desk store; on a test page there is no
        // /light, so the probe answers "no desk" — the hosted case.
        globalThis.fetch = vi.fn(async () => ({ ok: false, status: 404, headers: { get: () => 'text/html' }, json: async () => ({}) }))
        const { findByTestId, getAllByRole } = render(<RoomLookFollower document={documentWith(SHOW)} onEntities={onEntities} />)
        const chip = await findByTestId('rig-show-chip')
        expect(chip.textContent).toContain('SHOW')
        expect(chip.textContent).toContain('2 / 2 · Red room')
        // closed at first load (owner 2026-10-13: the scene is the page): only the line
        expect(chip.textContent).not.toContain('One beam')
        expect(chip.querySelector('button').getAttribute('aria-expanded')).toBe('false')
        await act(async () => { getAllByRole('button')[0].click() })
        expect(chip.textContent).toContain('One beam')
        expect(chip.textContent).toContain('Everyone watching sees the same look at the same moment.')
        expect(window.localStorage.getItem('di.panel.show')).toBe('1')
        await act(async () => { getAllByRole('button')[0].click() })
        expect(chip.textContent).not.toContain('One beam')
        expect(window.localStorage.getItem('di.panel.show')).toBeNull()
    })
})

describe('preview a look (owner 2026-10-12: pick a scene in view mode, for you only)', () => {
    it('shows the chosen look to this viewer, says PREVIEW, and follows the show again on request', async () => {
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(EPOCH + 12000) // the show is on cue 2 (red-room)
        const onEntities = vi.fn()
        globalThis.fetch = vi.fn(async () => ({ ok: false, status: 404, headers: { get: () => 'text/html' }, json: async () => ({}) }))
        const { findByTestId, getByRole } = render(<RoomLookFollower document={documentWith(SHOW)} onEntities={onEntities} />)
        const chip = await findByTestId('rig-show-chip')
        await act(async () => { chip.querySelector('button').click() }) // one click opens the looks
        await act(async () => { getByRole('button', { name: 'One beam' }).click() })
        expect(chip.dataset.preview).toBe('one-beam')
        expect(chip.dataset.look).toBe('one-beam')
        expect(chip.textContent).toContain('PREVIEW · One beam')
        expect(chip.textContent).toContain('the show is on')
        await act(async () => { getByRole('button', { name: 'Follow the show' }).click() })
        expect(chip.dataset.preview).toBeUndefined()
        expect(chip.dataset.look).toBe('red-room')
    })
})

describe('the LaserCubes follow the laser server while a desk is live (MOXIR 2026-10-17)', () => {
    // One lamp on the patch (index 1) the desk does not drive (its only row is index 2): the desk is live and followed.
    const lamp = { id: 'L1', type: 'spotLight', components: { transform: { position: [0, 6, 0], rotation: [0, 0, 0] }, light: { color: '#ffffff', intensity: 5, angle: 0.3 }, beam: { visible: true }, fixture: { type: 'up-b380f', index: 1 } } }
    const line = { id: 'rig-laser-1a', type: 'spotLight', components: { transform: { position: [0, 6, 0], rotation: [0, 0, 0] }, light: { color: '#00ff00', intensity: 3, angle: 0.1 }, beam: { visible: true, laser: { frames: { period: 8, list: [[[0, 0, 0, 1, 0]]] } } }, fixture: { type: 'ext-lc-ultra-mk2', dmx: false } } }
    const room = (list) => ({ entities: list, mappingState: { cues: [] } })
    const deskLive = () => {
        const snapshot = { present: true, fixtures: [{ index: 2, profile: 'none', values: [0] }], looks: [], lookFade: null }
        return { getSnapshot: () => snapshot, subscribe: () => () => {}, probe: () => Promise.resolve(true), watch: () => () => {} }
    }
    const lasers = (snapshot) => {
        const s = { listening: 0, getSnapshot: () => snapshot, subscribe: () => { s.listening += 1; return () => { s.listening -= 1 } } }
        return s
    }
    const lineIn = (result) => result.current.entities.find((e) => e.id === line.id)

    it('draws a cube\'s line while the laser server plays it on its armed cube, and rests it dark when it does not', async () => {
        // the document and the desk are made once: a new desk snapshot on every render would never settle
        const doc = room([lamp, line])
        const desk = deskLive()
        const playing = lasers({ playing: true, groups: ['rig-laser-1'] })
        const { result } = renderHook(() => useRigLookEntities(doc, { mirror: desk, laserShowStore: playing }))
        await waitFor(() => expect(playing.listening).toBe(1))
        expect(lineIn(result).components.beam.visible).toBe(true)
        expect(lineIn(result).components.rigShown).toBeUndefined()
        expect(result.current.entities.find((e) => e.id === 'L1').components.rigShown).toMatchObject({ undriven: true })
        const silent = lasers(NOT_PLAYING)
        const { result: dark } = renderHook(() => useRigLookEntities(doc, { mirror: desk, laserShowStore: silent }))
        await waitFor(() => expect(lineIn(dark).components.rigShown).toMatchObject({ level: 0, undriven: true }))
        expect(lineIn(dark).components.beam.visible).toBe(false)
    })

    it('polls only while a desk is live and the room holds a network laser; with no desk the design is drawn', async () => {
        const store = lasers({ playing: true, groups: ['rig-laser-1'] })
        const lampOnly = room([lamp])
        const desk = deskLive()
        renderHook(() => useRigLookEntities(lampOnly, { mirror: desk, laserShowStore: store }))
        const doc = room([lamp, line])
        const noDesk = fakeDesk({ present: false })
        const { result } = renderHook(() => useRigLookEntities(doc, { mirror: noDesk, laserShowStore: store }))
        await waitFor(() => expect(result.current.driver).toBeDefined())
        expect(store.listening).toBe(0)
        expect(lineIn(result).components.beam.visible).toBe(true)
        expect(lineIn(result).components.rigShown).toBeUndefined()
    })
})
