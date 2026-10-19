import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { CURRENT_MD_RECAP_PATHSPECS } from './repo-state-lib.mjs'

// 2026-10-20 (N885): dev's CURRENT.md was 3 days behind its code, and a branch may not
// write CURRENT.md, so every push was refused. A branch's session note now counts as
// its recap; the README of the notes folder does not.
const commitAt = (cwd, file, date) => {
  mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true })
  writeFileSync(path.join(cwd, file), `${file} ${date}\n`)
  execFileSync('git', ['add', file], { cwd })
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', file], {
    cwd, env: { ...process.env, GIT_AUTHOR_DATE: `${date}T12:00:00Z`, GIT_COMMITTER_DATE: `${date}T12:00:00Z` },
  })
}
const lastRecap = (cwd) => execFileSync('git', ['log', '-1', '--format=%cs', '--', ...CURRENT_MD_RECAP_PATHSPECS], { cwd, encoding: 'utf8' }).trim()

describe('CURRENT.md recap pathspecs', () => {
  const repo = () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'recap-'))
    execFileSync('git', ['init', '-q'], { cwd })
    commitAt(cwd, 'CURRENT.md', '2026-10-16')
    commitAt(cwd, 'src/a.js', '2026-10-19')
    return cwd
  }

  it('counts a branch session note as the recap', () => {
    const cwd = repo()
    commitAt(cwd, 'docs/ai/sessions/feat-x.md', '2026-10-19')
    expect(lastRecap(cwd)).toBe('2026-10-19')
  })

  it('does not count the notes README', () => {
    const cwd = repo()
    commitAt(cwd, 'docs/ai/sessions/README.md', '2026-10-19')
    expect(lastRecap(cwd)).toBe('2026-10-16')
  })

  it('still reads CURRENT.md when there is no note', () => {
    expect(lastRecap(repo())).toBe('2026-10-16')
  })
})
