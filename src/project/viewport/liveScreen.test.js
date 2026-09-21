import { describe, expect, it } from 'vitest'
import { normalizeMappingSurface } from '../../shared/projectSchema.js'
import {
    LIVE_SCREEN_RATES,
    PLATE_KINDS,
    liveScreenPlan,
    liveScreenRate,
    pickPictureElement,
    referencedSurfaceIds
} from './liveScreen.js'

const surfaceOf = (source, name = 'Wall left') => normalizeMappingSurface({ id: 'srf-1', name, resolution: [1280, 720], source })

describe('what a screen shows, by the surface it points at', () => {
    // The whole contract in one row: every kind the map lane can draw as an
    // element is a live texture; the two iframe kinds are a plate.
    it.each(['network', 'video', 'image', 'test', 'camera', 'stream', 'ndi'])('%s is a live texture', (kind) => {
        const plan = liveScreenPlan(surfaceOf({ kind, ref: kind === 'test' ? 'card' : 'x' }))
        expect(plan.mode).toBe('live')
        expect(plan.kind).toBe(kind)
        expect(plan.name).toBe('Wall left')
    })

    it.each(PLATE_KINDS)('%s is a page in an iframe and gets a dim named plate, never a texture', (kind) => {
        const plan = liveScreenPlan(surfaceOf({ kind, ref: 'https://example.org' }))
        expect(plan.mode).toBe('plate')
        expect(plan.title).toBe(`${kind} · Wall left`)
        expect(plan.detail).toBeTruthy()
    })

    it('a colour surface needs no texture at all', () => {
        expect(liveScreenPlan(surfaceOf({ kind: 'colour', ref: '#3a1d0a' }))).toMatchObject({ mode: 'colour', colour: '#3a1d0a' })
    })

    it('a surface that is gone is still a screen — a plate that says so', () => {
        const plan = liveScreenPlan(null, 'srf-gone')
        expect(plan.mode).toBe('plate')
        expect(plan.title).toContain('srf-gone')
        expect(plan.detail).toBe('that surface is gone')
    })

    it('a surface with no name is named by its id, so the plate is never blank', () => {
        expect(liveScreenPlan(surfaceOf({ kind: 'url', ref: 'https://x' }, '')).title).toBe('url · srf-1')
    })
})

describe('how often a screen re-uploads', () => {
    it('a video is driven by the frames the browser presents; the network is capped at 15, NDI at 30; stills upload once', () => {
        expect(LIVE_SCREEN_RATES.video).toBe('frame')
        expect(LIVE_SCREEN_RATES.camera).toBe('frame')
        expect(LIVE_SCREEN_RATES.stream).toBe('frame')
        expect(LIVE_SCREEN_RATES.network).toBe(15)
        expect(LIVE_SCREEN_RATES.ndi).toBe(30)
        expect(LIVE_SCREEN_RATES.image).toBe(0)
        expect(LIVE_SCREEN_RATES.test).toBe(0)
    })

    it('the element wins over the kind: a <video> is always frame-driven, a camera drawn through the motion glow is a canvas on the clock', () => {
        expect(liveScreenRate('camera', 'video')).toBe('frame')
        expect(liveScreenRate('camera', 'canvas')).toBe(30)
        expect(liveScreenRate('network', 'canvas')).toBe(15)
        expect(liveScreenRate('ndi', 'img')).toBe(30)
        expect(liveScreenRate('image', 'img')).toBe(0)
    })

    it('an unknown kind: a video or canvas moves, anything else is still', () => {
        expect(liveScreenRate('something-new', 'video')).toBe('frame')
        expect(liveScreenRate('something-new', 'canvas')).toBe(30)
        expect(liveScreenRate('something-new', 'img')).toBe(0)
    })
})

describe('which surfaces the room needs running', () => {
    it('lists each surface a plane points at once, in document order, and only planes', () => {
        const entities = [
            { id: 'a', type: 'plane', components: { surface: { surfaceId: 's2' } } },
            { id: 'b', type: 'box', components: { surface: { surfaceId: 's9' } } },
            { id: 'c', type: 'plane', components: { surface: { surfaceId: 's1' } } },
            { id: 'd', type: 'plane', components: { surface: { surfaceId: 's2' } } },
            { id: 'e', type: 'plane', components: {} }
        ]
        expect(referencedSurfaceIds(entities)).toEqual(['s2', 's1'])
    })

    it('an empty room needs nothing', () => {
        expect(referencedSurfaceIds([])).toEqual([])
        expect(referencedSurfaceIds(undefined)).toEqual([])
    })
})

describe('which element inside a mounted source is the picture', () => {
    const host = (html) => {
        const div = document.createElement('div')
        div.innerHTML = html
        return div
    }

    it('takes the canvas over the video it is drawn from (the motion glow keeps its video playing, hidden)', () => {
        const picked = pickPictureElement(host('<video class="map-source-hidden-video"></video><canvas class="map-source-media"></canvas>'))
        expect(picked.tagName).toBe('CANVAS')
    })

    it('takes a painted NDI image over the placeholder beside it, and the placeholder before it has painted', () => {
        expect(pickPictureElement(host('<img class="map-source-hidden-video"><div class="map-source-placeholder"></div>')).className).toBe('map-source-placeholder')
        expect(pickPictureElement(host('<img class="map-source-media"><div class="map-source-placeholder"></div>')).tagName).toBe('IMG')
    })

    it('takes the test pattern svg', () => {
        expect(pickPictureElement(host('<svg class="map-source-svg"></svg>')).tagName.toLowerCase()).toBe('svg')
    })

    it('finds nothing in an empty host', () => {
        expect(pickPictureElement(host(''))).toBeNull()
        expect(pickPictureElement(null)).toBeNull()
    })
})
