import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import MapStage from './MapStage.jsx'
import { regularGrid } from './sliceGeometry.js'
import { normalizeMappingState } from '../shared/projectSchema.js'

const output = { width: 1600, height: 720 }

const bentWarp = () => {
    const points = regularGrid(1, 1)
    points[4] = [0.6, 0.4]
    return { mode: 'linear', divisionsX: 1, divisionsY: 1, points }
}

const build = (patch = {}, source = { kind: 'colour', ref: '#ff0000' }) => normalizeMappingState({
    output,
    surfaces: [{
        id: 'a',
        name: 'A',
        enabled: true,
        corners: [[0.1, 0.1], [0.9, 0.12], [0.88, 0.9], [0.12, 0.88]],
        resolution: [800, 450],
        source,
        ...patch
    }]
})

const stage = (mapping) => <MapStage mapping={mapping} width={800} height={360} live={false} />
const surfaceOf = (container) => container.querySelector('[data-surface-id="a"]')

describe('MapStage slice settings', () => {
    it('draws a warped colour slice inside .map-stage-mesh with a mesh layer', () => {
        const { container } = render(stage(build({ warp: bentWarp() })))
        const mesh = container.querySelector('.map-stage-mesh')
        expect(mesh).toBeTruthy()
        expect(mesh.getAttribute('data-surface-id')).toBe('a')
        // The corner-pin element is not used for this slice.
        expect(container.querySelector('.map-stage-surface')).toBeNull()
        // jsdom has no WebGL, so the canvas may or may not exist; when it does, it is the mesh canvas.
        const canvas = mesh.querySelector('canvas')
        if (canvas) expect(canvas.className).toBe('map-mesh-canvas')
    })

    it('also meshes a test card', () => {
        // jsdom has no object URLs; the media rack turns the test card's markup into one.
        const had = URL.createObjectURL
        URL.createObjectURL = () => 'blob:test'
        URL.revokeObjectURL = () => {}
        const { container } = render(stage(build({ warp: bentWarp() }, { kind: 'test', ref: 'grid' })))
        expect(container.querySelector('.map-stage-mesh')).toBeTruthy()
        URL.createObjectURL = had
    })

    it('keeps an unmoved warp on the plain corner-pin', () => {
        const regular = { mode: 'linear', divisionsX: 1, divisionsY: 1, points: regularGrid(1, 1) }
        const { container } = render(stage(build({ warp: regular })))
        expect(container.querySelector('.map-stage-mesh')).toBeNull()
        expect(container.querySelector('.map-stage-surface')).toBeTruthy()
    })

    it('keeps a warped web page on its four corners with a corner-pin transform', () => {
        const { container } = render(stage(build({ warp: bentWarp() }, { kind: 'url', ref: 'https://example.com/' })))
        expect(container.querySelector('.map-stage-mesh')).toBeNull()
        expect(container.querySelector('.map-mesh-canvas')).toBeNull()
        const element = surfaceOf(container)
        expect(element.className).toContain('map-stage-surface')
        expect(element.style.transform).toMatch(/matrix3d/)
    })

    // Since the frame relay (frameRelay.jsx), an uploaded HTML visual bends
    // like a video: the stage runs ONE hidden relay page for it, sandboxed
    // exactly as the server serves it, and the slice draws through the mesh.
    it('bends a warped screen showing an html visual through the frame relay', () => {
        const mapping = normalizeMappingState({
            output,
            surfaces: [{ id: 'a', name: 'A', enabled: true, corners: [[0, 0], [1, 0], [1, 1], [0, 1]], resolution: [1600, 720], source: { kind: 'wall', ref: '' }, warp: bentWarp() }],
            visuals: [{ id: 'v1', name: 'Page', source: { kind: 'html', ref: '/uploads/page.html' } }],
            playing: 'v1'
        })
        const { container } = render(stage(mapping))
        expect(container.querySelector('.map-stage-mesh')).toBeTruthy()
        const relays = container.querySelectorAll('.map-relay-source')
        expect(relays).toHaveLength(1)
        expect(relays[0].getAttribute('sandbox')).toBe('allow-scripts allow-pointer-lock')
    })

    it('runs one relay page for two bent slices of the same html visual', () => {
        const mapping = normalizeMappingState({
            output,
            surfaces: [
                { id: 'a', name: 'A', enabled: true, corners: [[0, 0], [0.5, 0], [0.5, 1], [0, 1]], input: [0, 0, 0.5, 1], resolution: [800, 720], source: { kind: 'wall', ref: '' }, warp: bentWarp() },
                { id: 'b', name: 'B', enabled: true, corners: [[0.5, 0], [1, 0], [1, 1], [0.5, 1]], input: [0.5, 0, 0.5, 1], resolution: [800, 720], source: { kind: 'wall', ref: '' }, warp: bentWarp() }
            ],
            visuals: [{ id: 'v1', name: 'Page', source: { kind: 'html', ref: '/uploads/page.html' } }],
            playing: 'v1'
        })
        const { container } = render(stage(mapping))
        expect(container.querySelectorAll('.map-stage-mesh')).toHaveLength(2)
        expect(container.querySelectorAll('.map-relay-source')).toHaveLength(1)
    })

    it('flips with an inner .map-stage-flip', () => {
        for (const [flip, transform] of [['h', 'scale(-1, 1)'], ['v', 'scale(1, -1)'], ['hv', 'scale(-1, -1)']]) {
            const { container, unmount } = render(stage(build({ flip })))
            const inner = surfaceOf(container).querySelector('.map-stage-flip')
            expect(inner).toBeTruthy()
            expect(inner.style.transform).toBe(transform)
            unmount()
        }
        const { container } = render(stage(build({ flip: 'none' })))
        expect(container.querySelector('.map-stage-flip')).toBeNull()
    })

    it('draws an SVG colour filter when red, green or blue is not 0', () => {
        const { container } = render(stage(build({ red: 0.5 })))
        const defs = container.querySelector('svg.map-colour-defs')
        expect(defs).toBeTruthy()
        const filter = defs.querySelector('filter')
        expect(filter.querySelector('feComponentTransfer')).toBeTruthy()
        expect(filter.querySelector('feFuncR').getAttribute('slope')).toBe('1.5')
        // jsdom writes the reference back as url("#...").
        const applied = surfaceOf(container).style.filter
        expect(applied).toMatch(/^url\(["']?#map-colour-/)
        expect(applied).toContain(`#${filter.getAttribute('id')}`)
    })

    it('has no colour filter at defaults', () => {
        const { container } = render(stage(build()))
        expect(container.querySelector('svg.map-colour-defs')).toBeNull()
        expect(surfaceOf(container).style.filter).not.toContain('url(')
    })

    it('Is Key multiplies and goes grey', () => {
        const { container } = render(stage(build({ isKey: true })))
        const element = surfaceOf(container)
        expect(element.style.mixBlendMode).toBe('multiply')
        expect(element.style.filter).toContain('grayscale(1)')
    })

    it('blackBg false is transparent', () => {
        const { container } = render(stage(build({ blackBg: false })))
        expect(surfaceOf(container).style.background).toBe('transparent')
        const { container: other } = render(stage(build()))
        expect(surfaceOf(other).style.background).not.toBe('transparent')
    })

    it('an enabled soft edge with width gives a mask-image', () => {
        const { container } = render(stage(build({ softEdge: { enabled: true, left: 0.1, right: 0.1 } })))
        const element = surfaceOf(container)
        const mask = element.style.maskImage || element.style.webkitMaskImage || element.getAttribute('style')
        expect(String(mask)).toMatch(/linear-gradient/)
    })

    it('a soft edge with no width gives no mask', () => {
        const { container } = render(stage(build({ softEdge: { enabled: true } })))
        expect(surfaceOf(container).getAttribute('style')).not.toMatch(/mask/i)
    })
})
