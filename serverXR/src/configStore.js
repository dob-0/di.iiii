const path = require('node:path')
const fsp = require('node:fs/promises')
const { writeJson } = require('./jsonStore')

let configFilePath = null

const init = (spacesDir) => {
  configFilePath = path.join(spacesDir, '_server-config.json')
}

const read = async () => {
  if (!configFilePath) return {}
  try {
    return JSON.parse(await fsp.readFile(configFilePath, 'utf-8'))
  } catch {
    return {}
  }
}

const patch = async (updates) => {
  const current = await read()
  const next = { ...current, ...updates }
  if (configFilePath) {
    // jsonStore.writeJson is temp + rename: a freeze half-way through a plain writeFile left a truncated file, read() then
    // answers {} and this patch saved only its own keys over it (the open-space repoint was forgotten).
    await writeJson(configFilePath, next)
  }
  return next
}

module.exports = { init, read, patch }
