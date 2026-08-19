const fsp = require('node:fs/promises')
const sharp = require('sharp')
const logger = require('./logger')

// Formats sharp can re-encode losslessly enough to be worth scrubbing.
// Deliberately excludes:
//   svg  — sharp would rasterize it, destroying a vector asset
//   hdr/exr/gltf/glb/zip/bin — not images sharp decodes
//   video/audio — sharp can't touch them; see the gap note below
const SCRUBBABLE_FORMATS = new Set(['jpeg', 'png', 'webp', 'tiff', 'avif', 'gif'])

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
async function scrubImageMetadata(filePath) {
  let metadata
  try {
    metadata = await sharp(filePath).metadata()
  } catch {
    // Not a decodable image (video, archive, model, corrupt upload). Leave it
    // exactly as uploaded — rejecting here would break non-image uploads.
    return { scrubbed: false, reason: 'undecodable' }
  }

  const format = metadata?.format
  if (!format || !SCRUBBABLE_FORMATS.has(format)) {
    return { scrubbed: false, reason: 'unsupported-format', format }
  }

  const isAnimated = (metadata.pages || 1) > 1
  const tempPath = `${filePath}.scrub`

  try {
    // animated:true keeps every frame of an animated GIF/WebP; rotate() is
    // frame-hostile there and animated sources carry no EXIF orientation
    // anyway, so it is only applied to stills.
    const pipeline = sharp(filePath, { animated: isAnimated })
    const output = isAnimated ? pipeline : pipeline.rotate()
    await output.toFormat(format).toFile(tempPath)
    await fsp.rename(tempPath, filePath)
    return { scrubbed: true, format, animated: isAnimated }
  } catch (error) {
    await fsp.rm(tempPath, { force: true }).catch(() => {})
    // A scrub failure must not fail the upload — the asset is still valid, it
    // just keeps its metadata. Logged so it is visible rather than silent.
    logger.warn(`[assetScrub] could not scrub ${format} upload: ${error.message}`)
    return { scrubbed: false, reason: 'encode-failed', format }
  }
}

module.exports = {
  SCRUBBABLE_FORMATS,
  scrubImageMetadata
}
