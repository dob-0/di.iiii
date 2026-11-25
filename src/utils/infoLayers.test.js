import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import * as browser from './infoLayers.js'

const server = createRequire(import.meta.url)('../../shared/infoLayers.cjs')

describe('browser copy of the info layers', () => {
  it('matches shared/infoLayers.cjs', () => {
    expect(browser.LAYERS).toEqual(server.LAYERS)
    expect(browser.PANEL_LAYER).toEqual(server.PANEL_LAYER)
    expect(browser.DEFAULT_LAYER).toBe(server.DEFAULT_LAYER)
    for (const os of ['android', 'ios', 'ipados', 'linux', 'macOS', '', undefined]) {
      expect(browser.machineRowLayer({ os })).toBe(server.machineRowLayer({ os }))
    }
    expect(browser.panelLayer('nope')).toBe(server.panelLayer('nope'))
  })
})
