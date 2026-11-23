// @vitest-environment node

import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { normalizeReleaseInfo, EMPTY_RELEASE_INFO, loadReleaseInfo } = require('./releaseInfo.js')

describe('release info keeps what the packer writes', () => {
  it('keeps version, schemaVersion, packedAt and the per-part stamps', () => {
    const info = normalizeReleaseInfo({
      version: '0.4.4-dev.b9bc2640', gitCommit: 'abc', schemaVersion: 7, packedAt: '2026-11-17T10:00:00.000Z',
      parts: [{ id: 'light', commit: 'c'.repeat(40), date: '2026-11-12', history: [{ commit: 'c'.repeat(40), date: '2026-11-12', title: 'x (#5)', pr: 5 }] }, { id: 'osc', commit: null, date: null }]
    })
    expect(info).toMatchObject({ version: '0.4.4-dev.b9bc2640', gitCommit: 'abc', schemaVersion: 7, packedAt: '2026-11-17T10:00:00.000Z' })
    expect(info.parts).toEqual([{ id: 'light', commit: 'c'.repeat(40), date: '2026-11-12', history: [{ commit: 'c'.repeat(40), date: '2026-11-12', title: 'x (#5)', pr: 5 }] }, { id: 'osc', commit: null, date: null, history: [] }])
  })

  it('an old release.json without those fields still reads, with empties', () => {
    const info = normalizeReleaseInfo({ deployEnv: 'staging', gitCommit: 'abc' })
    expect(info).toMatchObject({ deployEnv: 'staging', version: null, schemaVersion: null, packedAt: null, parts: [] })
    expect(EMPTY_RELEASE_INFO.parts).toEqual([])
  })

  it('schemaVersion is an integer or null: empty string, false and true do not become numbers', () => {
    for (const v of ['', false, true, 'x', 1.5]) expect(normalizeReleaseInfo({ schemaVersion: v }).schemaVersion).toBeNull()
    expect(normalizeReleaseInfo({ schemaVersion: 7 }).schemaVersion).toBe(7)
  })

  it('a hand-edited file cannot put objects or more than 32 parts into the Monitor', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, commit: { evil: true }, date: 5 }))
    const info = normalizeReleaseInfo({ parts: many, version: { a: 1 }, schemaVersion: 'x', packedAt: ['y'] })
    expect(info.parts).toHaveLength(32)
    expect(info.parts[0]).toEqual({ id: 'p0', commit: null, date: null, history: [] })
    const junk = normalizeReleaseInfo({ parts: [{ id: 'a', commit: 'x'.repeat(10000), date: 'yesterday' }] })
    expect(junk.parts[0]).toEqual({ id: 'a', commit: null, date: null, history: [] })
    expect(info).toMatchObject({ version: null, schemaVersion: null, packedAt: null })
  })

  it('history is capped at 12, drops rows without a real hash and never keeps objects', () => {
    const h = Array.from({ length: 20 }, (_, i) => ({ commit: `${i}`.padStart(7, 'a'), date: '2026-11-01', title: 't'.repeat(500), pr: 3 }))
    h.push({ commit: { evil: 1 } })
    const [part] = normalizeReleaseInfo({ parts: [{ id: 'a', history: h }] }).parts
    expect(part.history).toHaveLength(12)
    expect(part.history[0].title).toHaveLength(140)
    expect(normalizeReleaseInfo({ parts: [{ id: 'a', history: [{ commit: { evil: 1 }, pr: '7' }] }] }).parts[0].history).toEqual([])
  })
})

describe('an installed server finds its release.json one folder above serverXR', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rel-'))
  const install = path.join(tmp, 'install')
  fs.mkdirSync(path.join(install, 'serverXR'), { recursive: true })
  fs.writeFileSync(path.join(install, 'release.json'), JSON.stringify({ version: '0.4.4-dev.abc', gitCommit: 'a'.repeat(40) }))
  it('reads <install>/release.json when serverXR/release.json is absent (the "commit unknown" on aylmo)', () => {
    expect(loadReleaseInfo(path.join(install, 'serverXR'))).toMatchObject({ version: '0.4.4-dev.abc', gitCommit: 'a'.repeat(40) })
  })
  it('prefers serverXR/release.json when both exist, and says empty when neither does', () => {
    fs.writeFileSync(path.join(install, 'serverXR', 'release.json'), JSON.stringify({ version: 'inner' }))
    expect(loadReleaseInfo(path.join(install, 'serverXR')).version).toBe('inner')
    expect(loadReleaseInfo(path.join(tmp, 'nowhere', 'serverXR'))).toEqual(EMPTY_RELEASE_INFO)
  })
})
