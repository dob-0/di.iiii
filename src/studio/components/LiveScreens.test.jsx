import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'

vi.mock('../../services/apiClient.js', () => ({
    apiBaseUrl: 'https://di-studio.xyz/serverXR'
}))

import LiveScreens, { drawPlate } from './LiveScreens.jsx'
import { applyProjectOps, normalizeProjectDocument } from '../../shared/projectSchema.js'

// jsdom has no 2D canvas and no object URLs; the plate is asserted through the
// words it paints and the texture through the element it wraps.
const painted = []
beforeEach(() => {
    painted.length = 0
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
        fillRect: vi.fn(), strokeRect: vi.fn(), drawImage: vi.fn(),
        fillText: (text) => painted.push(text),
        set fillStyle(v) { painted.push(`fill:${v}`) }, set strokeStyle(v) {}, set font(v) {},
        set lineWidth(v) {}, set textAlign(v) {}, set textBaseline(v) {}
    }))
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:test')
    globalThis.URL.revokeObjectURL = vi.fn()
})
afterEach(() => { vi.restoreAllMocks() })

const roomWith = ({ surfaces = [], planes = [] }) => {
    const base = normalizeProjectDocument({ projectMeta: { id: 'p', spaceId: 'main' } })
    return applyProjectOps(base, [
        ...surfaces.map((surface) => ({ type: 'createMappingSurface', payload: { surface } })),
        ...planes.map((plane) => ({
            type: 'createEntity',
            payload: { entity: { id: plane.id, type: 'plane', name: plane.id, components: { surface: { surfaceId: plane.surfaceId } } } }
        }))
    ])
}

describe('the sources behind the screens', () => {
    it('mounts one real map source per surface a plane points at — none for a surface nobody shows', () => {
        const document = roomWith({
            surfaces: [
                { id: 'wall', name: 'Wall', source: { kind: 'test', ref: 'card' } },
                { id: 'floor', name: 'Floor', source: { kind: 'test', ref: 'grid' } }
            ],
            planes: [{ id: 'screen-1', surfaceId: 'wall' }, { id: 'screen-2', surfaceId: 'wall' }]
        })
        const { container } = render(<LiveScreens document={document} onScreens={() => {}} />)
        const hosts = container.querySelectorAll('.studio-live-screen-host')
        expect(hosts.length).toBe(1)
        expect(hosts[0].dataset.surfaceId).toBe('wall')
        // The map lane's own test pattern, not a copy of it.
        expect(hosts[0].querySelector('svg.map-source-svg')).toBeTruthy()
    })

    it('hands the room a texture wrapped round the map lane\'s element, keyed by surface id', async () => {
        const document = roomWith({
            surfaces: [{ id: 'wall', name: 'Wall', source: { kind: 'test', ref: 'card' } }],
            planes: [{ id: 'screen-1', surfaceId: 'wall' }]
        })
        const onScreens = vi.fn()
        await act(async () => { render(<LiveScreens document={document} onScreens={onScreens} />) })
        const screens = onScreens.mock.calls.at(-1)[0]
        expect(screens.get('wall')?.texture?.isTexture).toBe(true)
        // A test pattern is an svg, rasterised into a canvas the texture reads.
        expect(screens.get('wall').texture.image.tagName).toBe('CANVAS')
    })

    it('gives an iframe surface (url, project) a dim named plate and NO map source', async () => {
        const document = roomWith({
            surfaces: [{ id: 'page', name: 'Wall left', source: { kind: 'url', ref: 'https://example.org' } }],
            planes: [{ id: 'screen-1', surfaceId: 'page' }]
        })
        const onScreens = vi.fn()
        let container
        await act(async () => { ({ container } = render(<LiveScreens document={document} onScreens={onScreens} />)) })
        expect(container.querySelector('.studio-live-screen-host')).toBeNull()
        expect(container.querySelector('iframe')).toBeNull()
        const screens = onScreens.mock.calls.at(-1)[0]
        expect(screens.get('page')?.texture?.isTexture).toBe(true)
        expect(painted).toContain('url · Wall left')
        expect(painted).toContain('a page, not a picture')
    })

    it('a colour surface is handed over as a colour, with nothing mounted', async () => {
        const document = roomWith({
            surfaces: [{ id: 'amber', name: 'Amber', source: { kind: 'colour', ref: '#3a1d0a' } }],
            planes: [{ id: 'screen-1', surfaceId: 'amber' }]
        })
        const onScreens = vi.fn()
        let container
        await act(async () => { ({ container } = render(<LiveScreens document={document} onScreens={onScreens} />)) })
        expect(container.querySelector('.studio-live-screen-host')).toBeNull()
        expect(onScreens.mock.calls.at(-1)[0].get('amber')).toEqual({ colour: '#3a1d0a' })
    })

    it('a screen pointing at a surface that no longer exists gets a plate that says so', async () => {
        const document = roomWith({ planes: [{ id: 'screen-1', surfaceId: 'srf-gone' }] })
        const onScreens = vi.fn()
        await act(async () => { render(<LiveScreens document={document} onScreens={onScreens} />) })
        expect(onScreens.mock.calls.at(-1)[0].get('srf-gone')?.texture?.isTexture).toBe(true)
        expect(painted).toContain('that surface is gone')
    })

    it('renders nothing at all for a room with no screens', () => {
        const { container } = render(<LiveScreens document={roomWith({})} onScreens={() => {}} />)
        expect(container.innerHTML).toBe('')
    })

    it('forgets its screens on the way out', async () => {
        const document = roomWith({
            surfaces: [{ id: 'wall', name: 'Wall', source: { kind: 'test', ref: 'card' } }],
            planes: [{ id: 'screen-1', surfaceId: 'wall' }]
        })
        const onScreens = vi.fn()
        let unmount
        await act(async () => { ({ unmount } = render(<LiveScreens document={document} onScreens={onScreens} />)) })
        await act(async () => { unmount() })
        // Each source unregisters itself on unmount; the last word is an empty map.
        expect(onScreens.mock.calls.at(-1)[0].size).toBe(0)
    })
})

describe('the plate', () => {
    it('paints in the card palette: the title in ink, the detail in the frame colour, on the card ground', () => {
        const canvas = document.createElement('canvas')
        canvas.width = 640
        canvas.height = 360
        drawPlate(canvas, { title: 'url · Wall', detail: 'a page, not a picture' })
        // Ground first, then the frame, then ink for the title, then frame for the detail.
        expect(painted[0]).toBe('fill:#0a0704')
        expect(painted).toContain('fill:#8f5a17')
        expect(painted).toContain('fill:#5c3a0f')
        expect(painted.indexOf('url · Wall')).toBeGreaterThan(painted.indexOf('fill:#8f5a17'))
        expect(painted.indexOf('a page, not a picture')).toBeGreaterThan(painted.indexOf('url · Wall'))
        // Never white.
        expect(painted.some((entry) => /fill:#f{3,6}$/i.test(entry))).toBe(false)
    })
})
