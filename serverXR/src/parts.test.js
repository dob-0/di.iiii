// @vitest-environment node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..', '..')
const { parts } = JSON.parse(fs.readFileSync(path.join(here, 'parts.json'), 'utf8'))

describe('parts.json: the parts the Monitor shows', () => {
  it('has unique ids and at least one dir per part', () => {
    expect(new Set(parts.map((p) => p.id)).size).toBe(parts.length)
    for (const part of parts) {
      expect(part.name, part.id).toBeTruthy()
      expect(part.dirs.length, part.id).toBeGreaterThan(0)
    }
  })

  it('every owning dir exists in the repo', () => {
    for (const part of parts) {
      for (const dir of part.dirs) expect(fs.existsSync(path.join(root, dir)), `${part.id}: ${dir}`).toBe(true)
    }
  })

  it('a probe is null or an absolute loopback route', () => {
    for (const part of parts) expect(part.probe === null || /^\/[a-z0-9\-/]+$/.test(part.probe), part.id).toBe(true)
  })

  // Regression guard: any light route except the clock BUILDS the desk (40 Hz loop, Art-Net bind) on a machine
  // with no lights (serverXR/src/routes/lightingRoutes.js). The Monitor may only ask the light desk its clock.
  it('the light desk is probed only through its clock', () => {
    expect(parts.find((p) => p.id === 'light').probe).toBe('/light/api/clock')
    const store = fs.readFileSync(path.join(here, 'monitorStore.js'), 'utf8')
    const routes = [...store.matchAll(/['"`](\/light\/[^'"`\s]*)['"`]/g)].map((m) => m[1])
    expect(routes.filter((r) => r !== '/light/api/clock')).toEqual([])
  })
})
