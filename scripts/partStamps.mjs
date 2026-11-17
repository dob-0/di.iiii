// The honest version of a part: the last commit that touched its directories (full hash + commit date),
// read from git when the install is PACKED. The installed server is not a git checkout, so this cannot be
// done later. With no git, or a part whose dirs have no history, the stamp says null, never a guess.
import { spawnSync } from 'node:child_process'

/** `git log -1 --format=<hash><TAB><date> -- <dirs>` → { commit, date } or { commit: null, date: null }. */
export function lastCommitFor(dirs, { cwd, run = spawnSync } = {}) {
  const result = run('git', ['log', '-1', '--format=%H%x09%cs', '--', ...dirs], { cwd, encoding: 'utf8' })
  if (!result || result.status !== 0) return { commit: null, date: null }
  const [commit, date] = String(result.stdout || '').trim().split('\t')
  return /^[0-9a-f]{40}$/.test(commit || '') && /^\d{4}-\d{2}-\d{2}$/.test(date || '')
    ? { commit, date }
    : { commit: null, date: null }
}

/** parts.json's list → [{ id, commit, date }], same order. */
export function stampParts(parts, options = {}) {
  return parts.map((part) => ({ id: part.id, ...lastCommitFor(part.dirs, options) }))
}
