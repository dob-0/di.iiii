const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')

// Receives a raw request body straight onto disk, hashing it on the way past.
//
// For the hash-pinned asset PUT (routes/projectRoutes.js): a followed space
// carries videos, and a 2 GB body must never sit in memory — not in a Buffer,
// not in multer's field parser. The bytes go to a temp file, the sha256 is
// computed from the same chunks that were written, and the caller decides what
// the file becomes. On ANY failure the temp file is removed here, so a caller
// that gets a rejection has nothing to clean up.

class BodyTooLargeError extends Error {
  constructor(maxBytes) {
    super(`Body exceeds ${maxBytes} bytes.`)
    this.code = 'BODY_TOO_LARGE'
  }
}

const receiveBodyToTempFile = async (req, { dir, maxBytes }) => {
  await fsp.mkdir(dir, { recursive: true })
  const tempPath = path.join(dir, `${Date.now()}-${crypto.randomUUID()}.verbatim`)
  const hash = crypto.createHash('sha256')
  const out = fs.createWriteStream(tempPath, { flags: 'wx' })
  let size = 0

  try {
    await new Promise((resolve, reject) => {
      let settled = false
      const fail = (error) => {
        if (settled) return
        settled = true
        req.unpipe?.(out)
        out.destroy()
        reject(error)
      }
      req.on('data', (chunk) => {
        size += chunk.length
        if (size > maxBytes) {
          fail(new BodyTooLargeError(maxBytes))
          return
        }
        hash.update(chunk)
        if (!out.write(chunk)) {
          req.pause()
          out.once('drain', () => req.resume())
        }
      })
      req.on('end', () => {
        if (settled) return
        out.end(() => {
          if (settled) return
          settled = true
          resolve()
        })
      })
      // A sender that hangs up mid-file has sent nothing we may keep.
      req.on('aborted', () => fail(new Error('Upload aborted.')))
      req.on('error', fail)
      out.on('error', fail)
    })
  } catch (error) {
    await fsp.rm(tempPath, { force: true }).catch(() => {})
    throw error
  }

  return { tempPath, sha256: hash.digest('hex'), size }
}

// A process killed mid-transfer leaves its temp file behind, and a followed
// space moves videos: a few of those and the disk guard starts refusing writes.
// Swept once at start. ONLY the two names this codebase writes for a file in
// flight (here, and follow/assets.js), ONLY in the directory given, and only
// when older than any transfer still plausibly running — never a directory,
// never anything else an upload left.
const STALE_TEMP_PATTERNS = [/\.verbatim$/, /^follow-.*\.part$/]
const STALE_TEMP_AGE_MS = 60 * 60 * 1000

const sweepStaleTempFiles = async (dir, { maxAgeMs = STALE_TEMP_AGE_MS, now = Date.now() } = {}) => {
  const removed = []
  const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isFile() || !STALE_TEMP_PATTERNS.some(pattern => pattern.test(entry.name))) continue
    const filePath = path.join(dir, entry.name)
    try {
      const { mtimeMs } = await fsp.stat(filePath)
      if (now - mtimeMs <= maxAgeMs) continue
      await fsp.rm(filePath, { force: true })
      removed.push(entry.name)
    } catch { /* gone already, or not ours to remove — either way not fatal */ }
  }
  return removed
}

module.exports = { receiveBodyToTempFile, sweepStaleTempFiles, BodyTooLargeError }
