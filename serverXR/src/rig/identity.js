// A member's identity: `<DATA_ROOT>/rig/machine.json` → { id, name }
// (docs/architecture/rig/PROTOCOL-1.md §1).
//
// The id is how every other member knows this machine across restarts,
// renames and IP changes, so it is created ONCE and never rewritten. Only the
// name follows the machine: DI_MACHINE_NAME wins, else the hostname. Written
// atomically (temp file + rename) because a power cut on a Pi mid-write would
// otherwise leave a half file — and a lost id is a machine every other member
// suddenly sees as a stranger.
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const MAX_ID = 128

const writeAtomic = (filePath, value) => {
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o644 })
  fs.renameSync(tmp, filePath)
}

const readExisting = (filePath) => {
  let raw
  try {
    raw = fs.readFileSync(filePath, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return { missing: true }
    throw error
  }
  try {
    const parsed = JSON.parse(raw)
    const id = typeof parsed?.id === 'string' ? parsed.id.trim() : ''
    if (id && id.length <= MAX_ID) return { id, name: typeof parsed.name === 'string' ? parsed.name : null }
  } catch {}
  return { broken: true }
}

function loadIdentity({ dataRoot, env = process.env, hostname = os.hostname() } = {}) {
  if (!dataRoot) throw new Error('loadIdentity needs a dataRoot')
  const dir = path.join(dataRoot, 'rig')
  const filePath = path.join(dir, 'machine.json')
  fs.mkdirSync(dir, { recursive: true })

  const override = String(env.DI_MACHINE_NAME || '').trim()
  const wantedName = (override || String(hostname || '').trim() || 'di').slice(0, MAX_ID)

  const existing = readExisting(filePath)
  if (existing.broken) {
    // Unreadable is not the same as absent: keep the bytes beside it so a
    // person can recover the old id by hand, then start a new one rather than
    // refuse to boot the whole server over a rig file.
    try { fs.renameSync(filePath, `${filePath}.broken-${Date.now()}`) } catch {}
  }
  const id = existing.id || crypto.randomUUID()

  if (existing.id && existing.name === wantedName) return { id, name: wantedName }
  writeAtomic(filePath, { id, name: wantedName })
  return { id, name: wantedName }
}

module.exports = { loadIdentity }
