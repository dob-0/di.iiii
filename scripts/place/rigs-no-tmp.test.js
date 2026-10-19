// A rig file must not point outside the repo: a path into /tmp (or a scratchpad) dies on reboot
// and the rig can no longer be rebuilt (found 2026-10-09 in moxir-hall-2026-10-08-v8-show-back21-far41.hall.json).
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const rigs = join(dirname(fileURLToPath(import.meta.url)), 'rigs')
const repoRoot = join(rigs, '..', '..', '..')
const files = readdirSync(rigs).filter((f) => f.endsWith('.json'))

describe('place rigs stay inside the repo', () => {
  it('has rig files to check', () => expect(files.length).toBeGreaterThan(10))
  it.each(files)('%s names no temporary path', (f) => {
    const text = readFileSync(join(rigs, f), 'utf8')
    expect(text).not.toMatch(/(^|[^\w.])(\.\.\/)*\/?tmp\/|scratchpad\/|\/tmp\/claude/)
  })
  it.each(files.filter((f) => f.endsWith('.hall.json')))('%s: every dimsFiles entry exists in the repo', (f) => {
    const hall = JSON.parse(readFileSync(join(rigs, f), 'utf8'))
    for (const p of hall.dimsFiles || []) expect(existsSync(join(repoRoot, p.replaceAll('\\', '/'))), p).toBe(true)
  })
})
