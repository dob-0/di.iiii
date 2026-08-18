const fsp = require('node:fs/promises')
const logger = require('./logger')

// Refuses state-changing requests while the data disk is nearly full, before
// any byte of the body is parsed or spooled — multer's temp file, the op-log
// append and SQLite all write to the same volume, and a half-written scene on
// a full disk is exactly the quiet corruption the sync work refused to allow.
// 507 with headroom left beats ENOSPC mid-write.
//
// DELETE stays allowed: it is how a full disk gets emptier.

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH'])

const createDiskWriteGuard = ({
  dir,
  minFreeBytes,
  statfs = fsp.statfs,
  cacheTtlMs = 5000,
  now = Date.now
} = {}) => {
  let cached = null
  let cachedAt = 0
  let warnedUnsupported = false

  const freeBytes = async () => {
    const at = now()
    if (cached !== null && at - cachedAt < cacheTtlMs) return cached
    const stats = await statfs(dir)
    cached = Number(stats.bavail) * Number(stats.bsize)
    cachedAt = at
    return cached
  }

  return async (req, res, next) => {
    if (!WRITE_METHODS.has(req.method)) return next()
    let free
    try {
      free = await freeBytes()
    } catch (error) {
      // A filesystem statfs can't read is not a reason to take every write
      // down — but say so once, loudly, instead of degrading in silence.
      if (!warnedUnsupported) {
        warnedUnsupported = true
        logger.warn(`[diskGuard] statfs(${dir}) failed (${error.code || error.message}) — free-disk pre-check disabled`)
      }
      return next()
    }
    const contentLength = Number(req.headers['content-length'])
    const incoming = Number.isFinite(contentLength) && contentLength > 0 ? contentLength : 0
    if (free >= minFreeBytes + incoming) return next()
    cached = null // a delete may free space; don't hold the refusal for the TTL
    logger.warn(`[diskGuard] refused ${req.method} ${req.path}: ${free} bytes free < ${minFreeBytes + incoming} required`)
    res.status(507).json({
      error: 'Server storage is nearly full — write refused to protect existing work. Free up space and retry.',
      code: 'insufficient_storage'
    })
  }
}

module.exports = { createDiskWriteGuard }
