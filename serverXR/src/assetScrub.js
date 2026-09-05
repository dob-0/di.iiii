const fsp = require('node:fs/promises')
const sharp = require('sharp')
const logger = require('./logger')

// Formats sharp can re-encode losslessly enough to be worth scrubbing.
// 'heif' covers both AVIF and HEIC/HEIF — libvips reports the container, not
// the codec, so an .avif upload arrives here as format 'heif' and the 'avif'
// entry below is only reached on builds that report it separately.
// Deliberately excludes:
//   svg  — sharp would rasterize it, destroying a vector asset
//   hdr/exr/gltf/glb/zip/bin — not images sharp decodes
//   video/audio — sharp can't touch them; see the gap note below
const SCRUBBABLE_FORMATS = new Set(['jpeg', 'png', 'webp', 'tiff', 'avif', 'gif', 'heif'])

// Shown to the person uploading, so it has to say what to do next.
const UNSCRUBBABLE_IMAGE_ERROR =
  'This image could not have its location and camera data removed, so it was not saved. ' +
  'iPhone HEIC photos are the usual cause — set Settings → Camera → Formats → Most Compatible, ' +
  'or re-save the photo as JPEG or PNG, and upload again.'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

// ISO-BMFF brands that mean "still image" rather than "video". An iPhone HEIC
// is `heic`/`heix` (HEVC-coded); AVIF is `avif`. Video (isom/mp41/qt) is
// absent on purpose — an .mp4 must keep passing through untouched.
const IMAGE_FTYP_BRANDS = new Set([
  'heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs',
  'mif1', 'mif2', 'msf1', 'avif', 'avis'
])

// What the *bytes* are, not what the client claimed they are. A scrub decision
// that trusts the declared mime type can be walked past by renaming the file.
function sniffRasterImage(head) {
  if (!head || head.length < 12) return ''
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg'
  if (head.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png'
  const first4 = head.toString('latin1', 0, 4)
  // TIFF, and every camera RAW built on it: II*\0 little-endian, MM\0* big-endian
  if (head[2] === 0x2a && head[3] === 0x00 && head[0] === head[1] &&
    (head[0] === 0x49 || head[0] === 0x4d)) return 'tiff'
  if (head.toString('latin1', 0, 3) === 'GIF') return 'gif'
  if (first4 === 'RIFF' && head.toString('latin1', 8, 12) === 'WEBP') return 'webp'
  if (head[0] === 0x42 && head[1] === 0x4d) return 'bmp'
  if (head.toString('latin1', 4, 8) === 'ftyp') {
    // major brand, then the compatible-brand list — but only within the ftyp
    // box, so a later box's bytes can never be read as a brand.
    const boxSize = Math.min(head.readUInt32BE(0) || 0, head.length)
    if (IMAGE_FTYP_BRANDS.has(head.toString('latin1', 8, 12).toLowerCase())) return 'heif'
    for (let i = 16; i + 4 <= boxSize; i += 4) {
      if (IMAGE_FTYP_BRANDS.has(head.toString('latin1', i, i + 4).toLowerCase())) return 'heif'
    }
  }
  return ''
}

async function readHead(filePath, bytes = 64) {
  let handle
  try {
    handle = await fsp.open(filePath, 'r')
    const buffer = Buffer.alloc(bytes)
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0)
    return buffer.subarray(0, bytesRead)
  } catch {
    return Buffer.alloc(0)
  } finally {
    await handle?.close().catch(() => {})
  }
}

// heifsave refuses to run without a compression, and the prebuilt libheif can
// only *encode* AV1 — an HEVC-coded HEIC therefore fails here rather than
// being silently re-saved. That failure is the point: it ends in a rejection,
// not in a verbatim store.
const encodeOptionsFor = (format, metadata) =>
  format === 'heif' ? { compression: metadata?.compression || 'av1' } : undefined

// Uploaded originals are stored verbatim and served verbatim to anyone with the
// URL, so a phone photo ships its EXIF — including GPS coordinates, device
// serial, and capture timestamp — to every visitor. sharp does not copy input
// metadata to its output unless asked, so a plain re-encode drops EXIF/IPTC/XMP.
//
// The one tag that must survive is orientation, and it survives as *pixels*:
// `.rotate()` with no argument applies the EXIF orientation and then discards
// the tag. Skipping that step is what makes naive strippers turn portrait
// photos sideways.
//
// Must run BEFORE the content hash is taken — the asset id is the sha256 of the
// bytes actually stored, and that invariant is what keeps immutable-cached
// assets from being swapped (see the id checks in spaceRoutes/projectRoutes).
//
// THE INVARIANT: a raster image that was not scrubbed must never reach the
// asset store. `safeToStore: false` says so, and every caller has to honour it
// — a photo whose metadata we failed to strip is exactly the file that must
// not end up on a public URL. Non-images (video, models, archives, SVG) are
// not raster images, carry no EXIF GPS, and still pass through untouched.
// EXIF orientation is applied by rotate(), so a portrait phone photo stored
// with width/height swapped in its header must be reported the way it renders.
const dimensionsOf = (metadata) => {
  const width = Number(metadata?.width) || 0
  const height = Number(metadata?.height) || 0
  if (!width || !height) return {}
  const turned = [5, 6, 7, 8].includes(Number(metadata?.orientation))
  return turned ? { width: height, height: width } : { width, height }
}

async function scrubImageMetadata(filePath) {
  const looksLikeImage = Boolean(sniffRasterImage(await readHead(filePath)))
  const unscrubbed = (reason, format) => ({
    scrubbed: false,
    reason,
    ...(format ? { format } : {}),
    safeToStore: !looksLikeImage
  })

  let metadata
  try {
    metadata = await sharp(filePath).metadata()
  } catch {
    // Not a decodable image (video, archive, model, corrupt upload) — or an
    // image in a codec this build cannot decode, which is why the sniff above
    // still gets a vote before this passes through.
    return unscrubbed('undecodable')
  }

  const format = metadata?.format
  if (!format || !SCRUBBABLE_FORMATS.has(format)) {
    return unscrubbed('unsupported-format', format)
  }

  const isAnimated = (metadata.pages || 1) > 1
  const tempPath = `${filePath}.scrub`

  try {
    // animated:true keeps every frame of an animated GIF/WebP; rotate() is
    // frame-hostile there and animated sources carry no EXIF orientation
    // anyway, so it is only applied to stills.
    const pipeline = sharp(filePath, { animated: isAnimated })
    const output = isAnimated ? pipeline : pipeline.rotate()
    await output.toFormat(format, encodeOptionsFor(format, metadata)).toFile(tempPath)
    await fsp.rename(tempPath, filePath)
    // The proportions travel with the result: a room with build zones has to
    // scale a banner down to its slot, and reading the file a second time to
    // learn 3.3:1 would be a second decode of every upload.
    return { scrubbed: true, format, animated: isAnimated, safeToStore: true, ...dimensionsOf(metadata) }
  } catch (error) {
    await fsp.rm(tempPath, { force: true }).catch(() => {})
    // Logged rather than silent: for a non-image this is harmless, for an image
    // it is a rejected upload and someone will ask why.
    logger.warn(`[assetScrub] could not scrub ${format} upload: ${error.message}`)
    return unscrubbed('encode-failed', format)
  }
}

// Same policy for bytes that never touched disk — the Drive imports download
// straight into memory and used to write whatever Drive handed them.
async function scrubImageBuffer(buffer) {
  const looksLikeImage = Boolean(sniffRasterImage(buffer.subarray(0, 64)))
  const unscrubbed = (reason, format) => ({
    buffer,
    scrubbed: false,
    reason,
    ...(format ? { format } : {}),
    safeToStore: !looksLikeImage
  })

  let metadata
  try {
    metadata = await sharp(buffer).metadata()
  } catch {
    return unscrubbed('undecodable')
  }

  const format = metadata?.format
  if (!format || !SCRUBBABLE_FORMATS.has(format)) {
    return unscrubbed('unsupported-format', format)
  }

  const isAnimated = (metadata.pages || 1) > 1
  try {
    const pipeline = sharp(buffer, { animated: isAnimated })
    const output = isAnimated ? pipeline : pipeline.rotate()
    const scrubbed = await output.toFormat(format, encodeOptionsFor(format, metadata)).toBuffer()
    return { buffer: scrubbed, scrubbed: true, format, animated: isAnimated, safeToStore: true }
  } catch (error) {
    logger.warn(`[assetScrub] could not scrub imported ${format}: ${error.message}`)
    return unscrubbed('encode-failed', format)
  }
}

module.exports = {
  SCRUBBABLE_FORMATS,
  UNSCRUBBABLE_IMAGE_ERROR,
  scrubImageBuffer,
  scrubImageMetadata,
  sniffRasterImage
}
