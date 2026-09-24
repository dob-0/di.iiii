import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The claim under test: a cue taken in the 3D scene and the same cue taken at
// the projection desk are the SAME EVENT. Not "equivalent", not "similar" —
// they call one function with one cue and produce one batch of ops, so a
// follower machine showing the output and a lighting desk in the room cannot
// tell which tool the operator was standing in.
//
// Both spies wrap the real thing rather than replacing it, so what is asserted
// is what actually runs.
const recallCueLighting = vi.fn(() => Promise.resolve(false))
vi.mock('../../map/lightingLink.js', async (importOriginal) => ({
    ...(await importOriginal()),
    recallCueLighting: (...args) => recallCueLighting(...args)
}))

const sharedFireCue = vi.fn()
vi.mock('../../map/cueFiring.js', async (importOriginal) => {
    const actual = await importOriginal()
    return {
        ...actual,
        fireCue: (...args) => {
            sharedFireCue(...args)
            return actual.fireCue(...args)
        }
    }
})

// The mapper's document hook is the op layer plus the network; only the op
// layer matters here, and the network would need a server.
const mapperApplyLocalOps = vi.fn()
vi.mock('../../project/hooks/useProjectDocumentSync.js', () => ({
    useProjectDocumentSync: () => ({
        applyLocalOps: (...args) => mapperApplyLocalOps(...args),
        syncState: {}
    })
}))

const { useMapDocument } = await import('../../map/useMapDocument.js')
const { useStudioCues } = await import('./useStudioCues.js')

const CUE = {
    id: 'cue-open',
    name: 'Open',
    key: '1',
    fade: 1.5,
    hold: 0,
    lightLook: 'look-warm',
    surfaces: { 'srf-wall': { opacity: 1, enabled: true } }
}
const SECOND = { id: 'cue-black', name: 'Blackout', key: '2', fade: 0, hold: 0, surfaces: { 'srf-wall': { opacity: 0 } } }

const studioDocument = { mappingState: { cues: [CUE, SECOND] } }

const renderStudio = (applyLocalOps, document = studioDocument) => renderHook(
    () => useStudioCues({ projectId: 'proj-1', document, applyLocalOps })
)

beforeEach(() => {
    recallCueLighting.mockClear()
    sharedFireCue.mockClear()
    mapperApplyLocalOps.mockClear()
})

describe('a cue fired from the 3D scene and the same cue fired from the mapper', () => {
    it('reach one function with one cue, and write one identical batch of ops', () => {
        const mapper = renderHook(() => useMapDocument('proj-1'))
        act(() => { mapper.result.current.fireCue(CUE) })

        const studioApplyLocalOps = vi.fn()
        const studio = renderStudio(studioApplyLocalOps)
        act(() => { studio.result.current.fireCue(CUE) })

        // One function, and it was handed the very same cue both times.
        expect(sharedFireCue).toHaveBeenCalledTimes(2)
        expect(sharedFireCue.mock.calls[0][0]).toBe(CUE)
        expect(sharedFireCue.mock.calls[1][0]).toBe(CUE)

        // One batch of ops, byte for byte — the fade the cue asks for and the
        // state of every surface it names, and nothing about geometry.
        expect(studioApplyLocalOps.mock.calls).toEqual(mapperApplyLocalOps.mock.calls)
        expect(mapperApplyLocalOps.mock.calls[0][0]).toEqual([
            { type: 'setMappingState', payload: { patch: { fade: 1.5 } } },
            { type: 'setMappingSurface', payload: { surfaceId: 'srf-wall', patch: { opacity: 1, enabled: true } } }
        ])

        // And the light goes with the wall from either tool.
        expect(recallCueLighting).toHaveBeenCalledTimes(2)
        expect(recallCueLighting.mock.calls[0][0]).toBe(recallCueLighting.mock.calls[1][0])
    })
})

describe('the number keys in the 3D scene', () => {
    it('fire the cue bound to that key — the mapper\'s own binding, not a second one', () => {
        const applyLocalOps = vi.fn()
        renderStudio(applyLocalOps)

        act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true })) })

        expect(sharedFireCue).toHaveBeenCalledTimes(1)
        expect(sharedFireCue.mock.calls[0][0]).toBe(SECOND)
    })

    it('marks the cue that is up, so the strip can say which one is live', () => {
        const { result } = renderStudio(vi.fn())
        expect(result.current.liveCueId).toBe(null)
        act(() => { result.current.fireCue(SECOND) })
        expect(result.current.liveCueId).toBe('cue-black')
    })

    it('leave a digit alone when no cue claims it', () => {
        renderStudio(vi.fn())
        act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: '7', bubbles: true })) })
        expect(sharedFireCue).not.toHaveBeenCalled()
    })

    it('leave a digit alone while somebody is typing', () => {
        renderStudio(vi.fn())
        const input = window.document.createElement('input')
        window.document.body.appendChild(input)
        input.focus()

        act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true })) })

        expect(sharedFireCue).not.toHaveBeenCalled()
        input.remove()
    })

    // A held modifier is somebody reaching for a browser tab or an app
    // shortcut, not for a cue. Ctrl+1 taking a cue would be a stage going dark
    // because an operator switched windows.
    it('leave a digit alone when a modifier is held', () => {
        renderStudio(vi.fn())
        act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', ctrlKey: true, bubbles: true })) })
        expect(sharedFireCue).not.toHaveBeenCalled()
    })

    // Nothing to fire means nothing listening: a project with no cues must not
    // have its digits quietly swallowed on the way to some other tool.
    it('are not claimed at all by a project with no cues', () => {
        const spy = vi.spyOn(window, 'addEventListener')
        renderStudio(vi.fn(), { mappingState: { cues: [] } })
        expect(spy.mock.calls.some(([type]) => type === 'keydown')).toBe(false)
        spy.mockRestore()
    })
})
