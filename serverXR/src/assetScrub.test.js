import os from 'node:os'
import path from 'node:path'
import fsp from 'node:fs/promises'
import { afterAll, describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { scrubImageBuffer, scrubImageMetadata } = require('./assetScrub.js')

// A real iPhone photo is an ISO-BMFF container branded `heic` whose payload is
// HEVC — a codec the prebuilt libvips cannot decode, so sharp never sees pixels
// and only the container is recognizable. That is exactly what these bytes are:
// enough header to be identified as a still image, nothing decodable inside.
const heicHeader = (brand = 'heic') => Buffer.concat([
  Buffer.from([0, 0, 0, 24]),
  Buffer.from(`ftyp${brand}`, 'latin1'),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from('mif1heic', 'latin1'),
  Buffer.from('hevc-payload-we-cannot-decode', 'latin1')
])

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
    expect(result.safeToStore).toBe(true)

    expect((await fsp.readFile(file)).equals(bytes)).toBe(true)
  })

  // libvips reports the *container*, so an .avif upload arrives as format
  // 'heif' — it never matched the 'avif' entry in SCRUBBABLE_FORMATS and was
  // stored with its EXIF intact until 'heif' was added.
  it('removes EXIF (incl. GPS) from an AVIF, which reports as format "heif"', async () => {
    const file = await tmpFile('gps.avif')
    await sharp({
      create: { width: 40, height: 60, channels: 3, background: { r: 1, g: 2, b: 3 } }
    }).withMetadata({ exif: EXIF_GPS }).avif({ quality: 40 }).toFile(file)

    const before = await sharp(file).metadata()
    expect(before.format).toBe('heif')
    expect(before.exif).toBeTruthy()

    const result = await scrubImageMetadata(file)
    expect(result).toMatchObject({ scrubbed: true, format: 'heif', safeToStore: true })

    const after = await sharp(file).metadata()
    expect(after.exif).toBeUndefined()
    expect(after.width).toBe(40)
  })

  // THE invariant. An image whose metadata we could not strip must never be
  // handed back as storable — a public asset URL serving an unscrubbed phone
  // photo publishes the photographer's GPS position.
  it('refuses to green-light a HEIC it cannot decode, instead of passing it through', async () => {
    const file = await tmpFile('iphone.heic')
    await fsp.writeFile(file, heicHeader())

    const result = await scrubImageMetadata(file)
    expect(result.scrubbed).toBe(false)
    expect(result.safeToStore).toBe(false)
  })

  it('refuses a JPEG whose pixels will not decode — a broken photo still carries EXIF', async () => {
    const file = await tmpFile('truncated.jpg')
    const good = await tmpFile('source-for-truncation.jpg')
    await makeJpegWithExif(good)
    const bytes = await fsp.readFile(good)
    await fsp.writeFile(file, bytes.subarray(0, Math.floor(bytes.length / 2)))

    const result = await scrubImageMetadata(file)
    expect(result.scrubbed).toBe(false)
    expect(result.safeToStore).toBe(false)
  })

  it('still lets video through — an .mp4 shares the ftyp header but is not a still image', async () => {
    const file = await tmpFile('clip.mp4')
    const bytes = Buffer.concat([
      Buffer.from([0, 0, 0, 24]),
      Buffer.from('ftypisom', 'latin1'),
      Buffer.from([0, 0, 2, 0]),
      Buffer.from('isomiso2avc1mp41moov', 'latin1')
    ])
    await fsp.writeFile(file, bytes)

    const result = await scrubImageMetadata(file)
    expect(result.safeToStore).toBe(true)
    expect((await fsp.readFile(file)).equals(bytes)).toBe(true)
  })
})

// The Drive imports write downloaded bytes straight to the asset store, on the
// same public URLs as an upload, so they answer to the same invariant.
describe('scrubImageBuffer', () => {
  it('strips EXIF from imported image bytes', async () => {
    const file = await tmpFile('imported.jpg')
    await makeJpegWithExif(file)
    const original = await fsp.readFile(file)

    const result = await scrubImageBuffer(original)
    expect(result).toMatchObject({ scrubbed: true, format: 'jpeg', safeToStore: true })
    expect(result.buffer.equals(original)).toBe(false)
    expect((await sharp(result.buffer).metadata()).exif).toBeUndefined()
  })

  it('refuses an imported HEIC it cannot scrub', async () => {
    const result = await scrubImageBuffer(heicHeader())
    expect(result.scrubbed).toBe(false)
    expect(result.safeToStore).toBe(false)
  })

  it('passes non-image bytes through untouched', async () => {
    const bytes = Buffer.from('PK zip-ish bytes that are not an image')
    const result = await scrubImageBuffer(bytes)
    expect(result.safeToStore).toBe(true)
    expect(result.buffer.equals(bytes)).toBe(true)
  })

  it('never throws on a corrupt upload — a scrub failure must not fail the upload', async () => {
    const file = await tmpFile('corrupt.jpg')
    await fsp.writeFile(file, Buffer.from('not actually a jpeg'))

    await expect(scrubImageMetadata(file)).resolves.toMatchObject({ scrubbed: false })
  })
})
