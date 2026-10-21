// @vitest-environment node
//
// PROVEN.md is read by tools/proven.js: a row is "untouched" only while git says its files did not move
// since the proven commit. These tests hold the reader and the three answers.

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { parse, status, PROVEN } = require('./tools/proven.js')
const here = path.dirname(fileURLToPath(import.meta.url))

describe('PROVEN.md', () => {
  const rows = parse(fs.readFileSync(PROVEN, 'utf8'))

  it('lists desk core and laser with a date, a commit, files and evidence', () => {
    for (const name of ['desk core', 'laser']) {
      const row = rows.find((r) => r.feature === name)
      expect(row, name).toBeTruthy()
      expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(row.commit).toMatch(/^[0-9a-f]{40}$/)
      expect(row.paths.length).toBeGreaterThan(0)
      expect(row.cmd).toBeTruthy()
      expect(row.evidence).toMatch(/docs\//)
    }
  })

  it('every watched path of every row exists in the repo', () => {
    const repo = path.join(here, '..', '..', '..')
    for (const row of rows) {
      for (const p of row.paths.filter((x) => !x.startsWith(':'))) {
        expect(fs.existsSync(path.join(repo, p)), `${row.feature}: ${p}`).toBe(true)
      }
    }
  })
})

describe('status()', () => {
  const row = { commit: 'abc1234', paths: ['a', 'b'] }
  it('is untouched when git diff --quiet exits 0, and asks git about the proven commit and the watched files', () => {
    let seen
    expect(status(row, (args) => { seen = args; return { status: 0 } })).toBe('untouched')
    expect(seen).toEqual(['diff', '--quiet', 'abc1234..HEAD', '--', 'a', 'b'])
  })
  it('is changed when the files differ, or the commit is unknown to this clone', () => {
    expect(status(row, () => ({ status: 1 }))).toBe('changed')
    expect(status(row, () => ({ status: 128 }))).toBe('changed')
  })
  it('is owed when the row has no commit yet', () => {
    expect(status({ commit: null, paths: ['a'] }, () => ({ status: 0 }))).toBe('owed')
  })
  it('parse() leaves a row without a proven commit as owed', () => {
    const [r] = parse('| x | `node t.js` | dev | - | - | a b | - |\n')
    expect(r.commit).toBeNull()
    expect(r.cmd).toBe('node t.js')
    expect(status(r)).toBe('owed')
  })
})
