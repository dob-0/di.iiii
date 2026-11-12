import { describe, expect, it } from 'vitest'
import { entitiesForWall, hasLiveWall, liveWallMounts, LIVE_WALL_KEY, readLiveWall, writeLiveWall } from './liveWall.js'

const memory = () => {
    const map = new Map()
    return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), map }
}
const screen = (extra = {}) => ({ id: 'w-live', type: 'plane', components: { surface: { surfaceId: 'srf' }, ...extra } })
const box = { id: 'w', type: 'box', components: {} }

describe('the live wall gate', () => {
    it('mounts nothing without a screen entity, switch on or off', () => {
        expect(liveWallMounts([box, { id: 'p', type: 'plane', components: {} }], true)).toBe(false)
        expect(liveWallMounts([], true)).toBe(false)
        expect(liveWallMounts(undefined, true)).toBe(false)
    })
    it('mounts with a drawn screen and the switch on, and not with the switch off', () => {
        expect(liveWallMounts([box, screen()], true)).toBe(true)
        expect(liveWallMounts([box, screen()], false)).toBe(false)
    })
    it('a hidden screen (the still mode) is not a wall: nothing runs for it', () => {
        expect(hasLiveWall([box, screen({ runtime: { visible: false } })])).toBe(false)
    })
    it('switch off leaves the screens out of the drawn list; on keeps the very same array', () => {
        const all = [box, screen()]
        expect(entitiesForWall(all, false).map((e) => e.id)).toEqual(['w'])
        expect(entitiesForWall(all, true)).toBe(all)
        const plain = [box]
        expect(entitiesForWall(plain, false)).toBe(plain)
    })
})

describe('the viewer switch', () => {
    it('is on by default and when storage is empty or throws', () => {
        expect(readLiveWall(memory())).toBe(true)
        expect(readLiveWall({ getItem: () => { throw new Error('blocked') } })).toBe(true)
        expect(readLiveWall(null)).toBe(true)
    })
    it('is stored in the browser as off only, and back to on removes it', () => {
        const store = memory()
        writeLiveWall(false, store)
        expect(store.map.get(LIVE_WALL_KEY)).toBe('off')
        expect(readLiveWall(store)).toBe(false)
        writeLiveWall(true, store)
        expect(store.map.has(LIVE_WALL_KEY)).toBe(false)
        expect(readLiveWall(store)).toBe(true)
    })
    it('a blocked storage does not throw on write', () => {
        expect(() => writeLiveWall(false, { setItem: () => { throw new Error('blocked') }, removeItem: () => {} })).not.toThrow()
    })
})
