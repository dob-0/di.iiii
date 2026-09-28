import { describe, expect, it, vi, afterEach } from 'vitest'
import { act, render, renderHook, waitFor } from '@testing-library/react'
import { useRigLookEntities } from './useRigLook.js'
import RoomLookFollower from './RoomLookFollower.jsx'

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

afterEach(() => { vi.useRealTimers() })

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
    it('names the look on and, opened, every look of the loop', async () => {
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(EPOCH + 12000)
        const onEntities = vi.fn()
        // RoomLookFollower reads the page's shared desk store; on a test page there is no
        // /light, so the probe answers "no desk" — the hosted case.
        globalThis.fetch = vi.fn(async () => ({ ok: false, status: 404, headers: { get: () => 'text/html' }, json: async () => ({}) }))
        const { findByTestId, getByRole } = render(<RoomLookFollower document={documentWith(SHOW)} onEntities={onEntities} />)
        const chip = await findByTestId('rig-show-chip')
        expect(chip.textContent).toContain('SHOW')
        expect(chip.textContent).toContain('2 / 2 · Red room')
        await act(async () => { getByRole('button').click() })
        expect(chip.textContent).toContain('One beam')
        expect(chip.textContent).toContain('Everyone watching sees the same look at the same moment.')
    })
})
