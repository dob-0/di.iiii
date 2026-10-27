import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
    viewPlan, viewSize, isTwoToOne, classifyMedia, parseGPano, parseFfprobe, hasInstaTrailer, readGPano,
    thinEvenly, parseSector, INSTA_TRAILER, MAX_VIEW_PX, MIN_VIEW_PX
} from './pano-lib.mjs'
import { planSources, findInstaRaw } from './frames.mjs'
import { panoArgs, buildSteps } from './place.mjs'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pano-lib-'))
const write = (name, buffer) => {
    const file = path.join(tmp, name)
    fs.writeFileSync(file, buffer)
    return file
}

describe('viewPlan', () => {
    it('is eight views round the horizon at 90 degrees plus one looking up', () => {
        const views = viewPlan()
        expect(views).toHaveLength(9)
        expect(views.slice(0, 8).map((v) => v.yaw)).toEqual([0, 45, 90, 135, 180, 225, 270, 315])
        expect(views.slice(0, 8).every((v) => v.pitch === 0 && v.fov === 90)).toBe(true)
        expect(views[8]).toMatchObject({ pitch: 90, index: 8 })
    })

    it('never looks down: the bottom of the sphere is the photographer', () => {
        expect(viewPlan({ horizon: 12, up: true }).every((v) => v.pitch >= 0)).toBe(true)
    })

    it('neighbours overlap: the step between views is smaller than the field of view', () => {
        const { fov } = viewPlan()[0]
        expect(45).toBeLessThan(fov)
    })

    it('refuses a rig that cannot cover the horizon or a silly field of view', () => {
        expect(() => viewPlan({ horizon: 2 })).toThrow(/at least 3/)
        expect(() => viewPlan({ fov: 10 })).toThrow(/between 40 and 140/)
        expect(() => viewPlan({ fov: 170 })).toThrow(/between 40 and 140/)
    })

    it('can drop the up view', () => {
        expect(viewPlan({ up: false })).toHaveLength(8)
    })
})

describe('viewSize', () => {
    it('follows the sphere\'s own density and stays within the limits', () => {
        expect(viewSize(7680, 90)).toBe(1920)
        expect(viewSize(11520, 90)).toBe(2400)
        expect(viewSize(1440, 90)).toBe(MIN_VIEW_PX)
        expect(MAX_VIEW_PX).toBeGreaterThan(MIN_VIEW_PX)
    })
})

describe('classifyMedia', () => {
    it('knows a sphere by its metadata and a 2:1 shape', () => {
        expect(classifyMedia({ width: 5760, height: 2880, projection: 'equirectangular' }).kind).toBe('equirect')
    })

    it('knows a sphere by 2:1 alone, and says that was the only basis', () => {
        const result = classifyMedia({ width: 3840, height: 1920 })
        expect(result.kind).toBe('equirect')
        expect(result.basis).toMatch(/no metadata/)
    })

    it('does not take an ordinary 16:9 or 4:3 picture for a sphere', () => {
        expect(classifyMedia({ width: 1920, height: 1080 }).kind).toBe('flat')
        expect(classifyMedia({ width: 4000, height: 3000 }).kind).toBe('flat')
    })

    it('does not take a tiny 2:1 thumbnail for a sphere', () => {
        expect(classifyMedia({ width: 400, height: 200 }).kind).toBe('flat')
    })

    it('treats a partial panorama (metadata but not 2:1) as flat', () => {
        expect(classifyMedia({ width: 8000, height: 2000, projection: 'equirectangular' }).kind).toBe('flat')
    })

    // A raw dual-fisheye sheet can itself be 2:1 — the signature must win over the aspect.
    it('calls a raw Insta360 file raw even when its shape is 2:1', () => {
        expect(classifyMedia({ width: 3840, height: 1920, instaTrailer: true }).kind).toBe('insta-raw')
        expect(classifyMedia({ dualStream: true, width: 2880, height: 2880 }).kind).toBe('insta-raw')
    })
})

describe('what is inside the file', () => {
    it('reads GPano:ProjectionType in element and attribute form', () => {
        expect(parseGPano('<GPano:ProjectionType>equirectangular</GPano:ProjectionType>')).toBe('equirectangular')
        expect(parseGPano('xmlns:GPano="x" GPano:ProjectionType="equirectangular" GPano:UsePanoramaViewer="True"')).toBe('equirectangular')
        expect(parseGPano('nothing here')).toBeNull()
    })

    it('reads the projection out of a JPEG\'s first 256 KB, not out of its name', () => {
        const xmp = Buffer.from('<x:xmpmeta><rdf:Description GPano:ProjectionType="equirectangular"/></x:xmpmeta>')
        const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8]), xmp, Buffer.alloc(100)])
        expect(readGPano(write('named-like-nothing.dat', jpeg))).toBe('equirectangular')
        expect(readGPano(write('plain.jpg', Buffer.from([0xff, 0xd8, 0, 0])))).toBeNull()
    })

    it('reads ffprobe\'s spherical side data and sees two square streams as a dual fisheye', () => {
        const sphere = parseFfprobe({ streams: [{ codec_type: 'video', width: 5760, height: 2880, side_data_list: [{ side_data_type: 'Spherical Mapping', projection: 'equirectangular' }] }] })
        expect(sphere).toMatchObject({ width: 5760, height: 2880, projection: 'equirectangular', dualStream: false })
        const dual = parseFfprobe({ streams: [{ codec_type: 'video', width: 2880, height: 2880 }, { codec_type: 'video', width: 2880, height: 2880 }, { codec_type: 'audio' }] })
        expect(dual.dualStream).toBe(true)
        expect(parseFfprobe({}).width).toBe(0)
    })

    it('finds a raw Insta360 file by its trailer whatever it is called', () => {
        const raw = write('walk.mp4', Buffer.concat([Buffer.alloc(500, 7), INSTA_TRAILER]))
        const plain = write('walk.insv', Buffer.alloc(500, 7))
        expect(hasInstaTrailer(raw)).toBe(true)
        expect(hasInstaTrailer(plain)).toBe(false)
        expect(findInstaRaw([raw, plain])).toEqual([raw])
        expect(hasInstaTrailer(path.join(tmp, 'missing'))).toBe(false)
    })

    it('does not let a raw file hide among the ignored extensions', () => {
        const raw = write('VID_001.insv', Buffer.concat([Buffer.alloc(100), INSTA_TRAILER]))
        expect(planSources([raw]).ignored).toEqual([raw])
        expect(findInstaRaw(planSources([raw]).ignored)).toEqual([raw])
    })
})

describe('small helpers', () => {
    it('thins a long list evenly and leaves a short one alone', () => {
        const items = Array.from({ length: 1000 }, (_, i) => i)
        const kept = thinEvenly(items, 10)
        expect(kept).toHaveLength(10)
        expect(kept[0]).toBeLessThan(100)
        expect(kept[9]).toBeGreaterThan(900)
        expect(thinEvenly([1, 2, 3], 10)).toEqual([1, 2, 3])
    })

    it('reads a mask sector', () => {
        expect(parseSector('180:50')).toEqual({ yaw: 180, half: 50 })
        expect(parseSector(undefined)).toBeNull()
        expect(() => parseSector('behind')).toThrow(/yaw:halfwidth/)
    })

    it('recognises a 2:1 sheet within one percent', () => {
        expect(isTwoToOne(3840, 1920)).toBe(true)
        expect(isTwoToOne(3840, 1910)).toBe(true)
        expect(isTwoToOne(3840, 1800)).toBe(false)
    })
})

describe('place.mjs hands the 360 knobs to the frames step, from a folder and from a space', () => {
    const pano = panoArgs({ views: '12', 'pano-fov': '100', 'no-up': true, 'mask-sector': '180:40', work: '/x' })
    it('forwards only the 360 flags', () => {
        expect(pano).toEqual(['--views', '12', '--pano-fov', '100', '--mask-sector', '180:40', '--no-up'])
    })
    it('adds them to --from', () => {
        const steps = buildSteps({ work: '/w', name: 'n', from: '/f', pano })
        expect(steps[0].args).toEqual(['--from', '/f', '--work', '/w', ...pano])
    })
    it('adds them to --from-space', () => {
        const steps = buildSteps({ work: '/w', name: 'n', fromSpace: 's', pano })
        expect(steps[0].args).toEqual(['--from-space', 's', '--work', '/w', ...pano])
    })
    it('changes nothing when there are none', () => {
        expect(buildSteps({ work: '/w', name: 'n', from: '/f' })[0].args).toEqual(['--from', '/f', '--work', '/w'])
    })
})
