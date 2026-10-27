import { describe, it, expect } from 'vitest'
import { injectPosesIntoSfm, posedScaleFromSidecar, readColmapCentres, readSfmCentres, scaleFromCentres, sidecarToColmap, webxrToColmap } from './poses-lib.mjs'
import { chooseScale } from './fit.mjs'
import { DEG, headingQuat, perspective, rotate } from '../../src/scan/ar/arMath.js'
import { addFrame, createSidecar } from '../../src/scan/ar/poseSidecar.js'

const walk = () => {
    const s = createSidecar({ spaceId: 'test', walk: 'walk-1' })
    const P = perspective(60 * DEG, 16 / 9)
    for (let k = 0; k < 12; k += 1) {
        const h = k * 30 * DEG
        addFrame(s, { file: `walk-1-${k}.jpg`, time: k * 500, pose: { position: [Math.sin(h) * 2, 1.5, Math.cos(h) * 2], orientation: headingQuat(h) }, projection: P, width: 1920, height: 1080 })
    }
    return s
}

describe('WebXR → COLMAP', () => {
    it('a world point in front of the WebXR camera lands at +z in OpenCV camera space, image y down', () => {
        const position = [1, 1.5, 2]
        const orientation = headingQuat(40 * DEG)
        const { w2c, t } = webxrToColmap(position, orientation)
        // a point 3 m ahead and 0.5 m up, in the world
        const ahead = rotate(orientation, [0, 0.5, -3]).map((v, i) => v + position[i])
        const cam = w2c.map((row, i) => row[0] * ahead[0] + row[1] * ahead[1] + row[2] * ahead[2] + t[i])
        expect(cam[2]).toBeCloseTo(3)
        expect(cam[1]).toBeCloseTo(-0.5) // up in the world is −y in OpenCV
        expect(cam[0]).toBeCloseTo(0)
    })
    it('writes cameras.txt / images.txt, and the centres read back are the walk’s centres', () => {
        const s = walk()
        const m = sidecarToColmap(s)
        expect(m.camerasTxt).toMatch(/^1 PINHOLE 1920 1080 /m)
        const centres = readColmapCentres(m.imagesTxt)
        expect(centres.size).toBe(12)
        const c = centres.get('walk-1-3.jpg')
        s.frames[3].position.forEach((v, i) => expect(c[i]).toBeCloseTo(v, 5))
    })
})

describe('scale from the walk', () => {
    it('Horn’s symmetric scale recovers a known scale through any rotation and shift', () => {
        const s = walk()
        // a "reconstruction" at 1/3.7 of the size, turned and moved
        const q = headingQuat(70 * DEG)
        const recon = new Map(s.frames.map((f) => [f.file, rotate(q, f.position.map((v) => v / 3.7)).map((v, i) => v + [5, -2, 9][i])]))
        const r = posedScaleFromSidecar(s, recon)
        expect(r.scale).toBeCloseTo(3.7, 6)
        expect(r.median).toBeCloseTo(3.7, 6)
        expect(r.spread).toBeLessThan(1e-6)
        expect(r.source).toBe('webxr-tracking')
        expect(scaleFromCentres([[0, 0, 0]], [[1, 1, 1]])).toBeNull()
    })
    it('fit.mjs takes it as measured, below a tape and above a door guess', () => {
        const bounds = { min: [0, 0, 0], max: [2, 1, 3] }
        const posed = { scale: 3.7, cameras: 12, spread: 0.01, source: 'webxr-tracking' }
        expect(chooseScale({ bounds, posed, doorGuess: true, door: { height: 1 } })).toMatchObject({ scale: 3.7, source: 'measured' })
        expect(chooseScale({ bounds, posed, scaleEdge: 9 }).scale).toBeCloseTo(3)
    })
})

describe('Meshroom SfMData', () => {
    it('locks the walk’s poses into the views CameraInit made, matched by file name', () => {
        const s = walk()
        const sfm = { version: ['1', '2', '8'], views: [{ viewId: '11', poseId: '11', path: '/x/walk-1-0.jpg' }, { viewId: '12', poseId: '12', path: '/x/other.jpg' }], intrinsics: [] }
        const { sfm: posed, matched } = injectPosesIntoSfm(sfm, s)
        expect(matched).toBe(1)
        expect(posed.poses[0]).toMatchObject({ poseId: '11', pose: { locked: '1' } })
        expect(posed.poses[0].pose.transform.rotation).toHaveLength(9)
        expect(readSfmCentres(posed).get('walk-1-0.jpg')[2]).toBeCloseTo(2)
    })
})
