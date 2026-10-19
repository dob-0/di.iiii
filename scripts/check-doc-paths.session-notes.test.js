import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// 2026-10-20 (N843): a lasting doc named docs/ai/sessions/<note>.md; the fold on dev
// deleted the note and the dev deploy of #971 failed (fixed by hand in #974).
const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-doc-paths.mjs')

const run = (agents) => {
  const root = mkdtempSync(path.join(tmpdir(), 'docpaths-'))
  mkdirSync(path.join(root, 'scripts'))
  copyFileSync(script, path.join(root, 'scripts', 'check-doc-paths.mjs'))
  mkdirSync(path.join(root, 'docs/ai/sessions'), { recursive: true })
  writeFileSync(path.join(root, 'docs/ai/sessions/README.md'), '# notes\n')
  writeFileSync(path.join(root, 'docs/ai/sessions/feat-x.md'), '## feat x\n')
  writeFileSync(path.join(root, 'AGENTS.md'), agents)
  return spawnSync('node', [path.join(root, 'scripts', 'check-doc-paths.mjs')], { encoding: 'utf8' })
}

describe('check-doc-paths and session notes', () => {
  it('refuses a lasting doc that names a session note, even while it exists', () => {
    const result = run('See `docs/ai/sessions/feat-x.md` for details.\n')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('which the fold deletes')
  })

  it('allows the notes README', () => {
    expect(run('Format: `docs/ai/sessions/README.md`.\n').status).toBe(0)
  })

  it('allows naming the notes folder itself', () => {
    expect(run('Notes live in `docs/ai/sessions/`.\n').status).toBe(0)
  })

  it('passes a doc with no session paths', () => {
    expect(run('Nothing here.\n').status).toBe(0)
  })
})
