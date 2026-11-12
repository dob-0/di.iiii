// screen-picture.mjs: the still on the LED screen sits on the audience face and has the screen's own size.
import { describe, it, expect } from 'vitest'
import { pictureEntity, pngSize } from './screen-picture.mjs'

const screen = { id: 'platina-screen', components: { transform: { position: [-0.04, 1.42, 0], rotation: [0, 0, 0], scale: [4.01, 2.5, 0.1] } } }

describe('the picture on the LED screen', () => {
    it('covers the screen exactly: an image plane is 3 high and aspect x 3 wide', () => {
        const e = pictureEntity({ screen, assetId: 'a1', px: { width: 1024, height: 640 } })
        // the image plane is drawn lying flat; the entity stands it up (+90 deg about x), so its height is the scale's z
        const [sx, sy, sz] = e.components.transform.scale
        expect(sx * (1024 / 640) * 3).toBeCloseTo(4.01, 2)
        expect(sz * 3).toBeCloseTo(2.5, 2)
        expect(sy).toBe(1)
        expect(e.components.transform.rotation[0]).toBeCloseTo(Math.PI / 2, 5)
        // where the plane's top edge (local 0, 0.01, -1.5 before the entity's scale and turn) lands: straight above, facing the audience
        const [rx] = e.components.transform.rotation
        const y = 0.01 * sy, z = -1.5 * sz
        expect(y * Math.cos(rx) - z * Math.sin(rx)).toBeCloseTo(1.25, 2)
        expect(y * Math.sin(rx) + z * Math.cos(rx)).toBeGreaterThan(0)
        expect(e.type).toBe('image')
        expect(e.components.media.assetId).toBe('a1')
    })

    it('sits just in front of the audience face, at the screen centre (the box stands on its position, so the centre is half a height up)', () => {
        const e = pictureEntity({ screen, assetId: 'a1', px: { width: 1024, height: 640 } })
        expect(e.components.transform.position).toEqual([-0.04, 2.67, 0.055])
    })

    it('never drifts: the picture says static, so walk mode gives it no idle motion (owner N3853)', () => {
        const e = pictureEntity({ screen: { id: 's', components: { transform: { position: [0, 1, 0], scale: [4, 2.5, 0.1] } } }, assetId: 'a', px: { width: 1024, height: 640 } })
        expect(e.components.animation.mode).toBe('static')
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
