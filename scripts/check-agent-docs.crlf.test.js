import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

// 2026-09-29: every push from a Windows machine was refused by the pre-push checks.
// Git for Windows (core.autocrlf=true) checks the docs out with CRLF, and
// check-agent-docs.mjs compared them raw against "\n" text: every generated bridge read
// "out of sync" and every SKILL.md "missing YAML frontmatter". This builds that
// checkout — this commit, every .md/.mdc turned CRLF — and runs the real checker on it.
const ROOT = path.resolve(import.meta.dirname, '..')
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

let tmp
let tree
afterAll(() => {
  if (tree) {
    try { git(ROOT, 'worktree', 'remove', '--force', tree) } catch { /* already gone */ }
  }
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true })
})

describe('check-agent-docs on a Windows (CRLF) checkout', () => {
  it('passes when the only difference is line endings', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crlf-docs-'))
    tree = path.join(tmp, 'w')
    git(ROOT, 'worktree', 'add', '--detach', tree, 'HEAD')
    // The checker must judge the committed files; carry this checkout's scripts over so
    // an uncommitted fix is what runs (in CI the two are the same commit).
    for (const f of ['check-agent-docs.mjs', 'sync-agent-docs.mjs']) {
      fs.copyFileSync(path.join(ROOT, 'scripts', f), path.join(tree, 'scripts', f))
    }
    const docs = git(tree, 'ls-files', '*.md', '*.mdc').split('\n').filter(Boolean)
    let converted = 0
    for (const rel of docs) {
      const file = path.join(tree, rel)
      const text = fs.readFileSync(file, 'utf8')
      if (text.includes('\r\n')) continue
      fs.writeFileSync(file, text.replace(/\n/g, '\r\n'))
      converted++
    }
    expect(converted).toBeGreaterThan(20)

    let out
    try {
      out = execFileSync('node', ['scripts/check-agent-docs.mjs'], { cwd: tree, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) {
      out = `${error.stdout}${error.stderr}`
    }
    expect(out).toContain('AI documentation checks passed')
  }, 60_000)
})
