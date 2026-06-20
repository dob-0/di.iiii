const path = require('node:path')
const fsp = require('node:fs/promises')

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
    await fsp.writeFile(configFilePath, JSON.stringify(next, null, 2), 'utf-8')
  }
  return next
}

module.exports = { init, read, patch }
