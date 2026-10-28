const path = require('node:path')
const fsp = require('node:fs/promises')
const crypto = require('node:crypto')
const logger = require('./logger')

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true })
}

function tryRecoverJson(raw = '') {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return null
  let cursor = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'))
  while (cursor >= 0) {
    const candidate = trimmed.slice(0, cursor + 1)
    try {
      return JSON.parse(candidate)
    } catch {
      const previousObject = trimmed.lastIndexOf('}', cursor - 1)
      const previousArray = trimmed.lastIndexOf(']', cursor - 1)
      cursor = Math.max(previousObject, previousArray)
    }
  }
  return null
}

async function writeJson(filePath, data) {
  await ensureDir(path.dirname(filePath))
  const serialized = JSON.stringify(data, null, 2)
  const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`
  try {
    await fsp.writeFile(tempPath, serialized)
    await fsp.rename(tempPath, filePath)
  } catch (error) {
    // A failed write (a full disk is the usual one) must not leave its half-written temp file behind: the next
    // attempt would find even less room, and nothing ever sweeps these.
    await fsp.rm(tempPath, { force: true }).catch(() => {})
    throw error
  }
}

// fsync(2) on a directory makes a rename inside it durable. Linux and macOS
// allow it on a read-only handle; Windows refuses to open a directory at all,
// and NTFS journals the rename itself, so there it is skipped.
async function syncDir(dirPath) {
  let handle
  try {
    handle = await fsp.open(dirPath, 'r')
    await handle.sync()
  } catch (error) {
    if (!['EISDIR', 'EPERM', 'EACCES', 'EINVAL', 'ENOTSUP'].includes(error?.code)) throw error
  } finally {
    await handle?.close().catch(() => {})
  }
}

// writeJson, made durable: the bytes reach the disk (fsync) before the rename,
// and the rename reaches the disk (fsync of the directory) before this returns.
// Without the first, a power cut after the rename can leave a zero-length file
// in place of a good one; without the second, the rename itself can be lost.
// The order is the one POSIX gives for an atomic, durable replace: write a
// temp file, fsync it, rename it over, fsync the directory (rename(2) and
// fsync(2), POSIX.1-2017; SQLite's "Atomic Commit In SQLite",
// https://sqlite.org/atomiccommit.html, flushes the file and its directory
// for the same reason).
// Used where a database commit is ordered after the file (sceneWrite.js).
async function writeJsonDurable(filePath, data) {
  await ensureDir(path.dirname(filePath))
  const serialized = JSON.stringify(data, null, 2)
  const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`
  let handle
  try {
    handle = await fsp.open(tempPath, 'w')
    await handle.writeFile(serialized)
    await handle.sync()
    await handle.close()
    handle = null
    await fsp.rename(tempPath, filePath)
    await syncDir(path.dirname(filePath))
  } catch (error) {
    await handle?.close().catch(() => {})
    await fsp.rm(tempPath, { force: true }).catch(() => {})
    throw error
  }
}

async function readJson(filePath, fallback = null) {
  try {
    const raw = await fsp.readFile(filePath, 'utf8')
    try {
      return JSON.parse(raw)
    } catch (error) {
      const recovered = tryRecoverJson(raw)
      if (recovered !== null) {
        // Keep the original bytes before overwriting — recovery truncates to
        // the last parseable prefix, which can silently drop real content if
        // the corruption is mid-file, not just a truncated tail.
        const backupPath = `${filePath}.corrupt-${Date.now()}.bak`
        await fsp.writeFile(backupPath, raw)
        logger.error(`[jsonStore] Recovered malformed JSON in ${filePath} by truncating to the last parseable prefix. Original bytes backed up to ${backupPath} — verify no content was lost.`)
        await writeJson(filePath, recovered)
        return recovered
      }
      throw error
    }
  } catch (error) {
    if (error.code === 'ENOENT') return fallback
    throw error
  }
}

module.exports = {
  ensureDir,
  tryRecoverJson,
  readJson,
  syncDir,
  writeJson,
  writeJsonDurable
}
