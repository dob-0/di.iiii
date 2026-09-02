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

// The cached statfs read, shared by anything that needs to know "is the data
// disk nearly full" — the HTTP guard below, and the socket chat path, which
// has no request/response to hang a 507 on but still writes to the same
// volume. One cache, one warning-once, so the two callers never disagree
// about how stale a reading is allowed to be.
const createFreeSpaceChecker = ({
  dir,
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
    try {
      const stats = await statfs(dir)
      cached = Number(stats.bavail) * Number(stats.bsize)
      cachedAt = at
      return cached
    } catch (error) {
      // A filesystem statfs can't read is not a reason to take every write
      // down — but say so once, loudly, instead of degrading in silence.
      if (!warnedUnsupported) {
        warnedUnsupported = true
        logger.warn(`[diskGuard] statfs(${dir}) failed (${error.code || error.message}) — free-disk pre-check disabled`)
      }
      return Infinity
    }
  }

  // A delete may free space; don't hold a refusal for the rest of the TTL.
  const invalidate = () => { cached = null }

  return { freeBytes, invalidate }
}

const createDiskWriteGuard = ({
  dir,
  minFreeBytes,
  statfs = fsp.statfs,
  cacheTtlMs = 5000,
  now = Date.now
} = {}) => {
  const checker = createFreeSpaceChecker({ dir, statfs, cacheTtlMs, now })

  return async (req, res, next) => {
    if (!WRITE_METHODS.has(req.method)) return next()
    const free = await checker.freeBytes()
    if (!Number.isFinite(free)) return next() // statfs unsupported/failing: fail open
    const contentLength = Number(req.headers['content-length'])
    const incoming = Number.isFinite(contentLength) && contentLength > 0 ? contentLength : 0
    if (free >= minFreeBytes + incoming) return next()
    checker.invalidate()
    logger.warn(`[diskGuard] refused ${req.method} ${req.path}: ${free} bytes free < ${minFreeBytes + incoming} required`)
    res.status(507).json({
      error: 'Server storage is nearly full — write refused to protect existing work. Free up space and retry.',
      code: 'insufficient_storage'
    })
  }
}

module.exports = { createDiskWriteGuard, createFreeSpaceChecker }
