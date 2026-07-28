import os from 'node:os'
import path from 'node:path'
import fsp from 'node:fs/promises'
import { afterAll, describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { scrubImageMetadata } = require('./assetScrub.js')

const tmpRoot = path.join(os.tmpdir(), 'assetScrub-test')

const tmpFile = async (name) => {
  await fsp.mkdir(tmpRoot, { recursive: true })
  return path.join(tmpRoot, name)
}

// A red 40x60 portrait image carrying GPS + device EXIF, written the way a
// phone camera would.
const EXIF_GPS = {
  IFD0: { Model: 'Pixel Test', Make: 'ACME' },
  GPS: { GPSLatitudeRef: 'N', GPSLatitude: '40/1 47/1 0/1', GPSLongitudeRef: 'E' }
}

const makeJpegWithExif = async (filePath, { orientation } = {}) => {
  let pipeline = sharp({
    create: { width: 40, height: 60, channels: 3, background: { r: 200, g: 30, b: 30 } }
  }).withMetadata({ exif: EXIF_GPS, ...(orientation ? { orientation } : {}) })
  await pipeline.jpeg().toFile(filePath)
}

afterAll(async () => {
  await fsp.rm(tmpRoot, { recursive: true, force: true })
})

describe('scrubImageMetadata', () => {
  it('removes EXIF (incl. GPS) from an uploaded JPEG', async () => {
    const file = await tmpFile('gps.jpg')
    await makeJpegWithExif(file)

    const before = await sharp(file).metadata()
    expect(before.exif).toBeTruthy()

    const result = await scrubImageMetadata(file)
    expect(result.scrubbed).toBe(true)
    expect(result.format).toBe('jpeg')

    const after = await sharp(file).metadata()
    expect(after.exif).toBeUndefined()
  })

  it('bakes EXIF orientation into pixels instead of dropping it — portraits must not end up sideways', async () => {
    const file = await tmpFile('rotated.jpg')
    // orientation 6 = rotate 90° CW on display. Stored 40x60; a viewer honouring
    // the tag shows it 60x40. After scrubbing there is no tag, so the pixels
    // themselves must already be 60x40 or the image renders rotated.
    await makeJpegWithExif(file, { orientation: 6 })

    await scrubImageMetadata(file)

    const after = await sharp(file).metadata()
    expect(after.exif).toBeUndefined()
    expect(after.width).toBe(60)
    expect(after.height).toBe(40)
  })

  it('changes the content hash, so the id must be recomputed after scrubbing', async () => {
    const file = await tmpFile('hash.jpg')
    await makeJpegWithExif(file)
    const originalBytes = await fsp.readFile(file)

    await scrubImageMetadata(file)
    const scrubbedBytes = await fsp.readFile(file)

    expect(scrubbedBytes.equals(originalBytes)).toBe(false)
  })

  it('preserves every frame of an animated GIF', async () => {
    const file = await tmpFile('anim.gif')
    await sharp({
      create: { width: 10, height: 30, channels: 3, background: { r: 0, g: 0, b: 255 } }
    }).gif().toFile(file)

    const result = await scrubImageMetadata(file)
    expect(result.scrubbed).toBe(true)

    const after = await sharp(file).metadata()
    expect(after.format).toBe('gif')
  })

  it('leaves an SVG untouched — rasterizing it would destroy a vector asset', async () => {
    const file = await tmpFile('vector.svg')
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'
    await fsp.writeFile(file, svg)

    const result = await scrubImageMetadata(file)
    expect(result.scrubbed).toBe(false)

    expect(await fsp.readFile(file, 'utf8')).toBe(svg)
  })

  it('leaves non-image uploads byte-identical', async () => {
    const file = await tmpFile('model.bin')
    const bytes = Buffer.from([0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00])
    await fsp.writeFile(file, bytes)

    const result = await scrubImageMetadata(file)
    expect(result.scrubbed).toBe(false)
    expect(result.reason).toBe('undecodable')

    expect((await fsp.readFile(file)).equals(bytes)).toBe(true)
  })

  it('never throws on a corrupt upload — a scrub failure must not fail the upload', async () => {
    const file = await tmpFile('corrupt.jpg')
    await fsp.writeFile(file, Buffer.from('not actually a jpeg'))

    await expect(scrubImageMetadata(file)).resolves.toMatchObject({ scrubbed: false })
  })
})
