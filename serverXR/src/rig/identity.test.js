// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { loadIdentity } = require('./identity.js')

const dirs = []
const tmp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dii-rig-id-'))
  dirs.push(dir)
  return dir
}
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }) })

const file = (dataRoot) => path.join(dataRoot, 'rig', 'machine.json')
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('rig identity', () => {
  it('creates <dataRoot>/rig/machine.json once with a uuid v4 and the hostname', () => {
    const dataRoot = tmp()
    const identity = loadIdentity({ dataRoot, env: {}, hostname: 'asuz' })
    expect(identity.id).toMatch(UUID_V4)
    expect(identity.name).toBe('asuz')
    expect(JSON.parse(fs.readFileSync(file(dataRoot), 'utf8'))).toEqual(identity)
  })

  it('never rewrites the id', () => {
    const dataRoot = tmp()
    const first = loadIdentity({ dataRoot, env: {}, hostname: 'asuz' })
    const second = loadIdentity({ dataRoot, env: {}, hostname: 'asuz' })
    const renamed = loadIdentity({ dataRoot, env: {}, hostname: 'asuz-2' })
    expect(second.id).toBe(first.id)
    expect(renamed).toEqual({ id: first.id, name: 'asuz-2' })
    expect(JSON.parse(fs.readFileSync(file(dataRoot), 'utf8'))).toEqual(renamed)
  })

  it('DI_MACHINE_NAME wins over the hostname', () => {
    const dataRoot = tmp()
    const identity = loadIdentity({ dataRoot, env: { DI_MACHINE_NAME: 'stage-left' }, hostname: 'asuz' })
    expect(identity.name).toBe('stage-left')
    expect(loadIdentity({ dataRoot, env: {}, hostname: 'asuz' })).toEqual({ id: identity.id, name: 'asuz' })
  })

  it('keeps an id written by hand or by an older release', () => {
    const dataRoot = tmp()
    fs.mkdirSync(path.join(dataRoot, 'rig'))
    fs.writeFileSync(file(dataRoot), JSON.stringify({ id: 'hand-made-id', name: 'old', extra: true }))
    expect(loadIdentity({ dataRoot, env: {}, hostname: 'new' })).toEqual({ id: 'hand-made-id', name: 'new' })
  })

  it('does not rewrite the file when nothing changed', () => {
    const dataRoot = tmp()
    loadIdentity({ dataRoot, env: {}, hostname: 'asuz' })
    const before = fs.statSync(file(dataRoot)).ino
    loadIdentity({ dataRoot, env: {}, hostname: 'asuz' })
    expect(fs.statSync(file(dataRoot)).ino).toBe(before)
  })

  it('writes atomically: no temp files left behind', () => {
    const dataRoot = tmp()
    loadIdentity({ dataRoot, env: {}, hostname: 'asuz' })
    loadIdentity({ dataRoot, env: {}, hostname: 'renamed' })
    expect(fs.readdirSync(path.join(dataRoot, 'rig'))).toEqual(['machine.json'])
  })

  it('moves a broken file aside and starts a new identity instead of refusing to boot', () => {
    const dataRoot = tmp()
    fs.mkdirSync(path.join(dataRoot, 'rig'))
    fs.writeFileSync(file(dataRoot), '{ half a fi')
    const identity = loadIdentity({ dataRoot, env: {}, hostname: 'asuz' })
    expect(identity.id).toMatch(UUID_V4)
    const names = fs.readdirSync(path.join(dataRoot, 'rig'))
    expect(names).toContain('machine.json')
    expect(names.some((n) => n.startsWith('machine.json.broken-'))).toBe(true)
  })
})
