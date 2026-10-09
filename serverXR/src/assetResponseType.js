// The response headers for an uploaded asset are decided here, by the server,
// from its own lists. The stored mimeType is what the uploading client said;
// it is only looked up, never echoed.
//
// Method: OWASP ASVS 4.0.3 V12.5.1/V12.5.2 and the OWASP File Upload Cheat
// Sheet ("Content-Type validation", "Content-Disposition"), plus
// `X-Content-Type-Options: nosniff` (Fetch standard) and a response CSP of
// `sandbox` (CSP Level 3 §6.3.2.1).
//
// Three outcomes:
//   - INLINE: passive media a browser shows without running script in it
//     (raster images, video, audio, 3D model files, plain text, JSON). Served
//     with that type and no Content-Disposition, so <img>, <video>, <audio>,
//     fetch() and the three.js loaders behave exactly as before.
//   - DOWNLOAD_KEEP_TYPE: types the app loads as subresources but a browser
//     would render as a document when opened alone (SVG needs its type for
//     <img>/TextureLoader to draw it; PDF is imported through pdf.js fetch;
//     archives). Served with the type and `Content-Disposition: attachment`.
//   - everything else: `application/octet-stream` + attachment.
// Every asset response also gets `nosniff` and `Content-Security-Policy:
// sandbox`. A subresource load ignores both the disposition and the response
// CSP, so scenes render; a top-level open of any asset runs in an opaque
// origin with no script.

const GENERIC_MIME_TYPES = new Set(['', 'application/octet-stream', 'binary/octet-stream'])

const INLINE_TYPES = new Set([
  // raster images
  'image/png', 'image/jpeg', 'image/pjpeg', 'image/gif', 'image/webp', 'image/avif',
  'image/bmp', 'image/x-ms-bmp', 'image/tiff', 'image/heic', 'image/heif',
  'image/x-icon', 'image/vnd.microsoft.icon', 'image/ktx2',
  'image/vnd.radiance', 'image/x-exr', 'image/aces',
  // video
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-m4v',
  'video/x-matroska', 'video/mpeg', 'video/3gpp', 'video/x-msvideo',
  // audio
  'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac',
  'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave', 'audio/ogg', 'audio/opus',
  'audio/webm', 'audio/flac', 'audio/x-flac', 'audio/aiff', 'audio/x-aiff',
  // 3D model files
  'model/gltf-binary', 'model/gltf+json', 'model/obj', 'model/mtl', 'model/stl',
  'model/x.stl-binary', 'model/x.stl-ascii', 'model/3mf', 'model/vnd.usdz+zip',
  // text the browser shows as text
  'text/plain', 'application/json'
])

const DOWNLOAD_KEEP_TYPE = new Set([
  'image/svg+xml',
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'application/gzip'
])

// For an upload that arrived with no type or a generic one, the name's
// extension may give a type on the lists above. Never consulted when the
// client named a specific type: a name cannot widen what a type allows.
const EXTENSION_TYPES = new Map([
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.gif', 'image/gif'],
  ['.webp', 'image/webp'], ['.avif', 'image/avif'], ['.hdr', 'image/vnd.radiance'], ['.exr', 'image/x-exr'],
  ['.ktx2', 'image/ktx2'], ['.svg', 'image/svg+xml'],
  ['.mp4', 'video/mp4'], ['.m4v', 'video/mp4'], ['.mov', 'video/quicktime'], ['.webm', 'video/webm'],
  ['.ogv', 'video/ogg'],
  ['.mp3', 'audio/mpeg'], ['.m4a', 'audio/mp4'], ['.wav', 'audio/wav'], ['.ogg', 'audio/ogg'],
  ['.oga', 'audio/ogg'], ['.flac', 'audio/flac'],
  ['.glb', 'model/gltf-binary'], ['.gltf', 'model/gltf+json'], ['.obj', 'model/obj'], ['.mtl', 'model/mtl'],
  ['.stl', 'model/stl'], ['.usdz', 'model/vnd.usdz+zip'],
  ['.pdf', 'application/pdf'], ['.zip', 'application/zip'], ['.json', 'application/json'], ['.txt', 'text/plain']
])

const normalizeMime = (value) => String(value || '').toLowerCase().split(';')[0].trim()

const extensionOf = (name) => {
  const match = /(\.[a-z0-9]+)$/i.exec(String(name || '').trim())
  return match ? match[1].toLowerCase() : ''
}

// → { contentType, disposition: 'inline' | 'attachment' }
const resolveAssetResponseType = (mimeType, name) => {
  let mime = normalizeMime(mimeType)
  if (GENERIC_MIME_TYPES.has(mime)) mime = EXTENSION_TYPES.get(extensionOf(name)) || mime
  if (INLINE_TYPES.has(mime)) return { contentType: mime, disposition: 'inline' }
  if (DOWNLOAD_KEEP_TYPE.has(mime)) return { contentType: mime, disposition: 'attachment' }
  return { contentType: 'application/octet-stream', disposition: 'attachment' }
}

// Sets every header that decides how a browser treats the bytes. Call it after
// any other Content-Type was set: it overwrites that.
const applyAssetSafetyHeaders = (res, mimeType, name) => {
  const { contentType, disposition } = resolveAssetResponseType(mimeType, name)
  res.setHeader('Content-Type', contentType)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Security-Policy', 'sandbox')
  if (disposition === 'attachment') {
    res.setHeader('Content-Disposition', 'attachment')
  } else if (typeof res.removeHeader === 'function') {
    res.removeHeader('Content-Disposition')
  }
}

module.exports = { resolveAssetResponseType, applyAssetSafetyHeaders, INLINE_TYPES, DOWNLOAD_KEEP_TYPE }
