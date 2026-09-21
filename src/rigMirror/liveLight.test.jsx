import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { fixtureByIndex, fixtureIndexOf, liveLight, liveLightEntity, useLiveFixture, useLiveLightEntity } from './liveLight.js'

const AUTHORED = { color: '#ffffff', intensity: 2, distance: 20, angle: 0.52, penumbra: 0.2, decay: 2 }
const lamp = (fixture) => ({
    id: 'spot-1',
    type: 'spotLight',
    components: { transform: { position: [1, 3, -2] }, light: { ...AUTHORED }, ...(fixture ? { fixture } : {}) }
})

const AMBER_FULL = { id: 'a', index: 3, name: 'Back left', x: 0.2, y: 0.3, colour: { r: 255, g: 120, b: 0 }, level: 1 }
const AMBER_HALF = { ...AMBER_FULL, colour: { r: 128, g: 60, b: 0 }, level: 0.5 }
const DARK = { ...AMBER_FULL, colour: { r: 0, g: 0, b: 0 }, level: 0 }

// A store with a knob: what the desk says can be changed between renders and every
// subscriber is told, the way the real one publishes a new 10 Hz frame.
const mirrorOf = (initial) => {
    let snapshot = initial
    const listeners = new Set()
    return {
        getSnapshot: () => snapshot,
        subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
        probe: vi.fn(),
        watch: vi.fn(() => () => {}),
        set(next) { snapshot = next; for (const fn of [...listeners]) fn() }
    }
}

describe('liveLight — what the desk says replaces what was authored', () => {
    it('reads the join: a positive whole number, nothing else', () => {
        expect(fixtureIndexOf(lamp({ index: 3 }))).toBe(3)
        expect(fixtureIndexOf(lamp({ index: '3' }))).toBe(3)
        expect(fixtureIndexOf(lamp({ index: 0 }))).toBeNull()
        expect(fixtureIndexOf(lamp({ index: 2.5 }))).toBeNull()
        expect(fixtureIndexOf(lamp())).toBeNull()
        expect(fixtureIndexOf(null)).toBeNull()
    })

    it('finds the fixture by index; the first one wins when two share it', () => {
        const twins = [{ ...AMBER_FULL, id: 'first' }, { ...AMBER_FULL, id: 'second' }]
        expect(fixtureByIndex(twins, 3)?.id).toBe('first')
        expect(fixtureByIndex(twins, 4)).toBeNull()
        expect(fixtureByIndex(twins, null)).toBeNull()
    })

    it('replaces the colour with the desk hue at full and scales the authored intensity by the level', () => {
        expect(liveLight(AUTHORED, AMBER_FULL)).toEqual({ ...AUTHORED, color: '#ff7800', intensity: 2 })
        const half = liveLight(AUTHORED, AMBER_HALF)
        expect(half.color).toBe('#ff7800') // hue, not the dimmed brown
        expect(half.intensity).toBeCloseTo(1, 5)
        expect(half.distance).toBe(20) // everything that is not colour or level is untouched
    })

    it('a fixture giving out nothing is a dark lamp: zero intensity, the neutral grey', () => {
        expect(liveLight(AUTHORED, DARK)).toEqual({ ...AUTHORED, color: '#5c6166', intensity: 0 })
    })

    it('with no fixture the authored light is returned as it was, the same object', () => {
        expect(liveLight(AUTHORED, null)).toBe(AUTHORED)
        const entity = lamp({ index: 3 })
        expect(liveLightEntity(entity, null)).toBe(entity)
    })

    it('never writes the document: the derived object is a copy, the source unchanged', () => {
        const entity = lamp({ index: 3 })
        const shown = liveLightEntity(entity, AMBER_FULL)
        expect(shown.components.light.color).toBe('#ff7800')
        expect(entity.components.light.color).toBe('#ffffff')
        expect(shown.components.fixture).toEqual({ index: 3 })
        expect(shown.components.transform).toBe(entity.components.transform)
    })
})

describe('useLiveLightEntity — follows the desk while live, authored when not', () => {
    it('shows the authored light while the desk is absent and never watches the store', () => {
        const mirror = mirrorOf({ present: false, fixtures: [], master: null, blackout: false })
        const entity = lamp({ index: 3 })
        const { result } = renderHook(() => useLiveLightEntity(entity, { mirror }))
        expect(result.current).toBe(entity)
        expect(mirror.probe).toHaveBeenCalled()
        // Still watching — the desk may arrive; an index is what starts the poll.
        expect(mirror.watch).toHaveBeenCalledTimes(1)
    })

    it('an object with no fixture never asks the desk for anything', () => {
        const mirror = mirrorOf({ present: true, fixtures: [AMBER_FULL], master: 255, blackout: false })
        const entity = lamp()
        const { result } = renderHook(() => useLiveLightEntity(entity, { mirror }))
        expect(result.current).toBe(entity)
        expect(mirror.watch).not.toHaveBeenCalled()
        expect(mirror.probe).not.toHaveBeenCalled()
    })

    it('follows the desk frame by frame while it is here, and falls back to the authored light when it goes', () => {
        const mirror = mirrorOf({ present: true, fixtures: [AMBER_FULL], master: 255, blackout: false })
        const entity = lamp({ index: 3 })
        const { result } = renderHook(() => useLiveLightEntity(entity, { mirror }))
        expect(result.current.components.light).toMatchObject({ color: '#ff7800', intensity: 2 })

        act(() => mirror.set({ present: true, fixtures: [AMBER_HALF], master: 255, blackout: false }))
        expect(result.current.components.light.intensity).toBeCloseTo(1, 5)

        act(() => mirror.set({ present: true, fixtures: [DARK], master: 255, blackout: true }))
        expect(result.current.components.light).toMatchObject({ color: '#5c6166', intensity: 0 })

        act(() => mirror.set({ present: false, fixtures: [], master: null, blackout: false }))
        expect(result.current).toBe(entity)
        expect(result.current.components.light).toEqual(AUTHORED)
    })

    it('re-renders only when ITS fixture changes, not on every frame of the rig', () => {
        const other = { ...AMBER_FULL, id: 'b', index: 4, name: 'Other' }
        const mirror = mirrorOf({ present: true, fixtures: [AMBER_FULL, other], master: 255, blackout: false })
        let renders = 0
        const { result } = renderHook(() => { renders += 1; return useLiveFixture(3, { mirror }) })
        const first = result.current
        const before = renders
        act(() => mirror.set({ present: true, fixtures: [AMBER_FULL, { ...other, level: 0.2, colour: { r: 50, g: 20, b: 0 } }], master: 255, blackout: false }))
        expect(result.current).toBe(first)
        expect(renders).toBe(before)
    })
})
