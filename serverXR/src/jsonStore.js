const path = require('node:path')
const fsp = require('node:fs/promises')
const crypto = require('node:crypto')

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
  await fsp.writeFile(tempPath, serialized)
  await fsp.rename(tempPath, filePath)
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
        console.error(`[jsonStore] Recovered malformed JSON in ${filePath} by truncating to the last parseable prefix. Original bytes backed up to ${backupPath} — verify no content was lost.`)
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
  writeJson
}
