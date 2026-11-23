// The honest version of a part: the last commit that touched its directories (full hash + commit date),
// read from git when the install is PACKED. The installed server is not a git checkout, so this cannot be
// done later. With no git, or a part whose dirs have no history, the stamp says null, never a guess.
import { spawnSync } from 'node:child_process'

/** `git log -1 --format=<hash><TAB><date> -- <dirs>` → { commit, date } or { commit: null, date: null }. */
/** A shallow clone would stamp every part with the same tip commit: precise-looking and meaningless. */
export function isShallow({ cwd, run = spawnSync } = {}) {
  const out = run('git', ['rev-parse', '--is-shallow-repository'], { cwd, encoding: 'utf8' })
  return Boolean(out) && String(out.stdout || '').trim() === 'true'
}

export function lastCommitFor(dirs, { cwd, run = spawnSync, shallow = isShallow({ cwd, run }) } = {}) {
  if (shallow) return { commit: null, date: null }
  const result = run('git', ['log', '-1', '--format=%H%x09%cs', '--', ...dirs], { cwd, encoding: 'utf8' })
  if (!result || result.status !== 0) return { commit: null, date: null }
  const [commit, date] = String(result.stdout || '').trim().split('\t')
  return /^[0-9a-f]{40}$/.test(commit || '') && /^\d{4}-\d{2}-\d{2}$/.test(date || '')
    ? { commit, date }
    : { commit: null, date: null }
}

/** parts.json's list → [{ id, commit, date }], same order. */
export function stampParts(parts, options = {}) {
  const shallow = isShallow(options) // asked once, not once per part
  return parts.map((part) => ({ id: part.id, ...lastCommitFor(part.dirs, { ...options, shallow }), history: historyFor(part.dirs, { ...options, shallow }) }))
}

/**
 * Past versions of a part: the last commits that touched its dirs, newest first, with the merged PR number
 * parsed from the subject ("... (#1303)", the squash-merge form). Read at pack time like the stamp.
 * Shallow clone or no git: [] (unknown), never a guess.
 */
export function historyFor(dirs, { cwd, run = spawnSync, shallow = isShallow({ cwd, run }), limit = 10 } = {}) {
  if (shallow) return []
  const result = run('git', ['log', `-${limit}`, '--format=%H%x09%cs%x09%s', '--', ...dirs], { cwd, encoding: 'utf8' })
  if (!result || result.status !== 0) return []
  return String(result.stdout || '').split('\n').map((line) => {
    const [commit, date, ...rest] = line.split('\t')
    const title = rest.join('\t').trim().slice(0, 140)
    const pr = /\(#(\d{1,7})\)\s*$/.exec(title)
    return { commit, date, title, pr: pr ? Number(pr[1]) : null }
  }).filter((h) => /^[0-9a-f]{40}$/.test(h.commit || '') && /^\d{4}-\d{2}-\d{2}$/.test(h.date || ''))
}
