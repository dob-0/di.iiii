// screen-picture.mjs: the still on the LED screen sits on the audience face and has the screen's own size.
import { describe, it, expect } from 'vitest'
import { pictureEntity, pngSize } from './screen-picture.mjs'

const screen = { id: 'platina-screen', components: { transform: { position: [-0.04, 2.67, 0], rotation: [0, 0, 0], scale: [4.01, 2.5, 0.1] } } }

describe('the picture on the LED screen', () => {
    it('covers the screen exactly: an image plane is 3 high and aspect x 3 wide', () => {
        const e = pictureEntity({ screen, assetId: 'a1', px: { width: 1024, height: 640 } })
        const [sx, sy] = e.components.transform.scale
        expect(sx * (1024 / 640) * 3).toBeCloseTo(4.01, 2)
        expect(sy * 3).toBeCloseTo(2.5, 2)
        expect(e.type).toBe('image')
        expect(e.components.media.assetId).toBe('a1')
    })

    it('sits just in front of the audience face, at the screen centre', () => {
        const e = pictureEntity({ screen, assetId: 'a1', px: { width: 1024, height: 640 } })
        expect(e.components.transform.position).toEqual([-0.04, 2.67, 0.055])
    })

    it('level is the wall brightness, kept inside 0..1', () => {
        expect(pictureEntity({ screen, assetId: 'a', px: { width: 2, height: 1 }, level: 0.4 }).components.appearance.opacity).toBe(0.4)
        expect(pictureEntity({ screen, assetId: 'a', px: { width: 2, height: 1 }, level: 7 }).components.appearance.opacity).toBe(1)
    })

    it('reads a PNG size from its header and refuses another file', () => {
        const png = Buffer.alloc(24)
        png.writeUInt32BE(0x89504e47, 0); png.write('IHDR', 12, 'latin1'); png.writeUInt32BE(1024, 16); png.writeUInt32BE(640, 20)
        expect(pngSize(png)).toEqual({ width: 1024, height: 640 })
        expect(() => pngSize(Buffer.from('not a picture at all, just text'))).toThrow(/not a PNG/)
    })
})
