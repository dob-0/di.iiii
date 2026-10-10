/**
 * A lock every serverXR process on one data folder respects — for one file.
 *
 * The method is proper-lockfile 4.1.2 (pinned in serverXR/package.json), the
 * established cross-process lock on a shared disk: an atomic mkdir of
 * `<file>.lock`, kept fresh by touching its mtime while held, and taken over
 * when the mtime is older than `stale` (the holder died). Released on process
 * exit by its signal-exit hook. https://github.com/moxystudio/node-proper-lockfile
 *
 * Project writes (projectWrite.js) and scene writes (sceneWrite.js) both take
 * it, each on its own document file. It was written for projects on
 * 2026-10-02 (PR #728, "two servers on one data folder") and moved here
 * unchanged so the scene path uses the same lock, not a second one.
 *
 * The lock is the first line. The second is always the database: the version
 * check, op append and version bump are one BEGIN IMMEDIATE transaction, so a
 * writer that got past a broken lock loses cleanly with a 409.
 */

const lockfile = require('proper-lockfile')

// A write holds the lock for milliseconds; ten seconds without a touch means
// the holder is gone (killed by node --watch, a crash). proper-lockfile
// touches the lock every stale/2 while it is held, so a slow write on a big
// document does not lose it.
const STALE_MS = 10_000
// About fifteen seconds of patience, growing from 10 ms to 200 ms between
// tries — longer than STALE_MS, so a dead holder's lock is always taken over
// before a waiting request gives up.
const RETRIES = { retries: 80, factor: 1.25, minTimeout: 10, maxTimeout: 200 }

/**
 * Run `fn` holding the lock on `filePath` (the lock itself is `<filePath>.lock`).
 * `busy()` builds the error thrown when the lock could not be had in time;
 * `label` names the thing in the log line said when another process took the
 * lock over.
 */
const withDataFileLock = async ({ filePath, label, busy, log = console, stale = STALE_MS, retries = RETRIES }, fn) => {
  let release
  try {
    release = await lockfile.lock(filePath, {
      realpath: false,
      lockfilePath: `${filePath}.lock`,
      stale,
      retries,
      // Compromised = another process judged us dead and took the lock. The
      // database's own version check still stands behind this, so it is a
      // warning, never a crash (proper-lockfile's default is to throw).
      onCompromised: (error) => log.warn?.(`${label}: write lock taken over by another process (${error?.message || error}) — the version check in the database still guards this write`)
    })
  } catch (error) {
    if (error?.code === 'ELOCKED') throw busy()
    throw error
  }
  try {
    return await fn()
  } finally {
    try { await release() } catch { /* already released or taken over — said above */ }
  }
}

module.exports = { withDataFileLock, STALE_MS, RETRIES }
