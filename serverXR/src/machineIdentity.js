// Which di.iiii this is.
//
// Two installs that share a space through a follow each need a name the other
// side can show ("aylmo", "asuz") and an id that survives a restart, a rename
// of the machine, and an update — so a browser tab on one machine can address a
// tab on the other. The id is minted once and kept in DATA_ROOT, beside the
// work, because `di backup` carries DATA_ROOT and a restored machine should be
// the same machine.
//
// Never throws: a data dir that is read-only or a machine.json that is corrupt
// still gets an identity — regenerated, and held in memory for the life of the
// process so it does not change between two requests.

const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const FILE = 'machine.json'
const FORMAT = 'di.machine'

const remembered = new Map()

const filePath = (dataDir) => path.join(dataDir, FILE)

const readStored = (dataDir) => {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath(dataDir), 'utf8'))
    if (!parsed || parsed.format !== FORMAT || typeof parsed.id !== 'string' || !parsed.id) return null
    return parsed
  } catch {
    return null
  }
}

const writeStored = (dataDir, body) => {
  try {
    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(filePath(dataDir), `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 })
  } catch {
    // Not being able to keep the id is not a reason to have none.
  }
}

const hostName = () => {
  try { return os.hostname() || 'di.iiii' } catch { return 'di.iiii' }
}

/**
 * @param {string} dataDir  DATA_ROOT
 * @returns {{ id: string, name: string }}
 */
const getMachine = (dataDir) => {
  const key = String(dataDir || '')
  let stored = remembered.get(key) || null
  if (!stored) {
    stored = key ? readStored(key) : null
    if (!stored) {
      stored = { format: FORMAT, version: 1, id: crypto.randomUUID() }
      if (key) writeStored(key, stored)
    }
    remembered.set(key, stored)
  }
  const envName = String(process.env.DI_MACHINE_NAME || '').trim()
  const storedName = typeof stored.name === 'string' ? stored.name.trim() : ''
  // Whether pages on this machine run JavaScript written on the desk — code
  // saved on another machine, running here. Off unless the machine's owner
  // says so in its own di.env (DI_DESK_SCRIPTS=1); never switchable from a page.
  const scripts = String(process.env.DI_DESK_SCRIPTS || '').trim() === '1'
  return { id: stored.id, name: envName || storedName || hostName(), scripts }
}

/** Tests only: forget what was read, so a changed file is read again. */
const forgetMachines = () => remembered.clear()

module.exports = { getMachine, forgetMachines, FORMAT }
