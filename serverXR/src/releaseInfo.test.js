// @vitest-environment node

import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { normalizeReleaseInfo, EMPTY_RELEASE_INFO } = require('./releaseInfo.js')

describe('release info keeps what the packer writes', () => {
  it('keeps version, schemaVersion, packedAt and the per-part stamps', () => {
    const info = normalizeReleaseInfo({
      version: '0.4.4-dev.b9bc2640', gitCommit: 'abc', schemaVersion: 7, packedAt: '2026-11-17T10:00:00.000Z',
      parts: [{ id: 'light', commit: 'c'.repeat(40), date: '2026-11-12' }, { id: 'osc', commit: null, date: null }]
    })
    expect(info).toMatchObject({ version: '0.4.4-dev.b9bc2640', gitCommit: 'abc', schemaVersion: 7, packedAt: '2026-11-17T10:00:00.000Z' })
    expect(info.parts).toEqual([{ id: 'light', commit: 'c'.repeat(40), date: '2026-11-12' }, { id: 'osc', commit: null, date: null }])
  })

  it('an old release.json without those fields still reads, with empties', () => {
    const info = normalizeReleaseInfo({ deployEnv: 'staging', gitCommit: 'abc' })
    expect(info).toMatchObject({ deployEnv: 'staging', version: null, schemaVersion: null, packedAt: null, parts: [] })
    expect(EMPTY_RELEASE_INFO.parts).toEqual([])
  })

  it('a hand-edited file cannot put objects or more than 32 parts into the Monitor', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, commit: { evil: true }, date: 5 }))
    const info = normalizeReleaseInfo({ parts: many, version: { a: 1 }, schemaVersion: 'x', packedAt: ['y'] })
    expect(info.parts).toHaveLength(32)
    expect(info.parts[0]).toEqual({ id: 'p0', commit: null, date: null })
    expect(info).toMatchObject({ version: null, schemaVersion: null, packedAt: null })
  })
})
