import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    SOURCES_OFF_KEY, cameraSourceKey, getSourcesOff, inputSourceKey, isSourceOff, networkSourceKey,
    parseSourcesOff, resetSourcesOffForTest, setSourceOff, subscribeSourcesOff
} from './sourceSwitch.js'

beforeEach(() => { localStorage.clear(); resetSourcesOffForTest() })
afterEach(() => { localStorage.clear(); resetSourcesOffForTest(); vi.restoreAllMocks() })

describe('sourceSwitch store', () => {
    it('starts with nothing off', () => {
        expect(getSourcesOff().size).toBe(0)
        expect(isSourceOff('camera:Front')).toBe(false)
    })
    it('builds keys from what a clip stores', () => {
        expect(cameraSourceKey(' Front ')).toBe('camera:Front')
        expect(cameraSourceKey('')).toBe('')
        expect(inputSourceKey('in2')).toBe('input:in2')
        expect(networkSourceKey('PC (OBS)')).toBe('ndi:PC (OBS)')
    })
    it('reads a stored state and writes version 1', () => {
        localStorage.setItem(SOURCES_OFF_KEY, JSON.stringify({ v: 1, off: ['camera:A', 'input:in1', 7] }))
        expect([...getSourcesOff()].sort()).toEqual(['camera:A', 'input:in1'])
        setSourceOff('camera:B', true)
        expect(JSON.parse(localStorage.getItem(SOURCES_OFF_KEY))).toEqual({ v: 1, off: ['camera:A', 'input:in1', 'camera:B'] })
        setSourceOff('camera:A', false)
        expect(isSourceOff('camera:A')).toBe(false)
    })
    it('removes the key when the last source is on again', () => {
        setSourceOff('camera:A', true)
        setSourceOff('camera:A', false)
        expect(localStorage.getItem(SOURCES_OFF_KEY)).toBeNull()
    })
    it('an unknown version or a broken value means nothing is off', () => {
        for (const text of ['{"v":2,"off":["camera:A"]}', 'not json', '{"v":1,"off":"x"}', 'null', '[]']) {
            localStorage.setItem(SOURCES_OFF_KEY, text)
            resetSourcesOffForTest()
            expect(getSourcesOff().size, text).toBe(0)
        }
        expect(parseSourcesOff(undefined).size).toBe(0)
    })
    it('a refusing storage still lets this page follow its own change', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
        expect(getSourcesOff().size).toBe(0)
        setSourceOff('camera:A', true)
        expect(isSourceOff('camera:A')).toBe(true)
    })
    it('subscribe hears a change in the same page; the snapshot is stable until then', () => {
        const hear = vi.fn()
        const stop = subscribeSourcesOff(hear)
        const before = getSourcesOff()
        expect(getSourcesOff()).toBe(before)
        setSourceOff('input:in1', true)
        expect(hear).toHaveBeenCalledTimes(1)
        expect(getSourcesOff()).not.toBe(before)
        setSourceOff('input:in1', true)
        expect(hear).toHaveBeenCalledTimes(1)
        stop()
        setSourceOff('input:in1', false)
        expect(hear).toHaveBeenCalledTimes(1)
    })
    it('another page is heard through the window storage event', () => {
        const hear = vi.fn()
        const stop = subscribeSourcesOff(hear)
        localStorage.setItem(SOURCES_OFF_KEY, JSON.stringify({ v: 1, off: ['camera:Z'] }))
        window.dispatchEvent(new StorageEvent('storage', { key: SOURCES_OFF_KEY }))
        expect(hear).toHaveBeenCalledTimes(1)
        expect(isSourceOff('camera:Z')).toBe(true)
        window.dispatchEvent(new StorageEvent('storage', { key: 'something.else' }))
        expect(hear).toHaveBeenCalledTimes(1)
        localStorage.clear()
        window.dispatchEvent(new StorageEvent('storage', { key: null }))
        expect(isSourceOff('camera:Z')).toBe(false)
        stop()
    })
})
