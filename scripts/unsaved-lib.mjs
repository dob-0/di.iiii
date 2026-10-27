/**
 * unsaved-lib.mjs — "what lives only on this machine?"
 *
 * On 2026-09-28 a collaborator's laptop held 22 commits and ~60 changed files
 * that were on no remote at all, some of them 25 days old. Nothing said so:
 * start-check answers "am I behind?", never "is my work anywhere but here?".
 * A laptop that is lost, wiped, or handed on takes that work with it.
 *
 * This file is the one answer to the second question, for any git repo, used by
 * `npm run start-check` (this checkout) and `npm run unsaved -- <dir>...` (every
 * repo under the folders a person works in, di.iiii or not). Read-only: it runs
 * `git log`, `git status`, `git stash list`, `git worktree list` and nothing that
 * writes. It works the same whoever made the work — a person at the keyboard,
 * Claude, or any other assistant — because it only looks at what git holds.
 *
 * Nothing here decides for anyone. It names each thing and the command that
 * puts it on a remote; the person pushes.
 *
 * One thing it does set aside, and counts instead of listing: a wholly untracked
 * scratch folder (SCRATCH_DIRS below). It is not work worth saving, so it is not
 * "only here" in the sense this file exists for, and listing it buried the real items.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const DAY_MS = 24 * 60 * 60 * 1000

// A repo's git calls get this long each. A scan over a home folder must not hang
// on one broken repo; a timed-out call reads as "could not check", never as clean.
export const GIT_TIMEOUT_MS = 15_000

export const makeGit = (cwd) => (args) => {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024
    }).replace(/\s+$/, '')
  } catch {
    return null // null = could not run; '' = ran, nothing to report
  }
}

/**
 * Parses `git log --branches --not --remotes --source --format=%S%x09%ct`.
 * Each commit on no remote, tagged with the local branch that reaches it.
 * Returns [{ branch, commits, oldestMs }] — the branch's count of commits that
 * exist nowhere else, and when the oldest of them was made.
 */
export const parseUnpushedLog = (out) => {
  const byBranch = new Map()
  for (const line of (out || '').split('\n')) {
    const [source, ct] = line.split('\t')
    if (!source || !ct) continue
    const branch = source.replace(/^refs\/heads\//, '')
    const ms = Number(ct) * 1000
    const row = byBranch.get(branch) || { branch, commits: 0, oldestMs: ms }
    row.commits += 1
    row.oldestMs = Math.min(row.oldestMs, ms)
    byBranch.set(branch, row)
  }
  return [...byBranch.values()].sort((a, b) => a.oldestMs - b.oldestMs)
}

/** Parses `git worktree list --porcelain` into [{ path, branch }]. */
export const parseWorktrees = (out) => {
  const trees = []
  let current = null
  for (const line of (out || '').split('\n')) {
    if (line.startsWith('worktree ')) {
      current = { path: line.slice('worktree '.length), branch: null, prunable: false }
      trees.push(current)
    } else if (current && line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '')
    } else if (current && line.startsWith('prunable')) {
      current.prunable = true
    }
  }
  return trees
}

/** The path of one `git status --porcelain` line: unquoted, and the new name of a rename. */
export const statusPath = (line) => {
  let rel = line.slice(3)
  if (rel.includes(' -> ')) rel = rel.split(' -> ').pop()
  return rel.replace(/^"|"$/g, '')
}

/**
 * Folders a check or a build leaves in a worktree and nobody means to keep:
 *   .verify       a worker's screenshots and one-off driver scripts ("not committed" every time
 *                 PROGRESS.md names it; the repo already ignores .verify-surfaces/ and its kin)
 *   __pycache__   Python's bytecode cache (scripts/place runs under CPython and Blender)
 * Named, not pattern-matched: a folder joins this list only with a source that says it is scratch.
 */
export const SCRATCH_DIRS = ['.verify', '__pycache__']

/**
 * True for the porcelain line of a WHOLLY UNTRACKED scratch folder — `?? .verify/`. Nothing else
 * is set aside: a file with that name, an untracked file inside a folder git already tracks, or
 * a tracked file that was edited all keep their line, because those can be work.
 */
export const isScratchEntry = (line) => {
  if (!line.startsWith('?? ')) return false
  const rel = statusPath(line)
  if (!rel.endsWith('/')) return false
  return SCRATCH_DIRS.includes(rel.slice(0, -1).split('/').pop())
}

/**
 * When the oldest of these uncommitted changes was made, from the files' mtimes.
 * git keeps no time for uncommitted work, so the file system is the only witness;
 * a deleted file has no mtime and is skipped. null when nothing could be read.
 */
export const oldestChange = (treePath, porcelainLines) => {
  let oldest = null
  for (const line of porcelainLines) {
    const rel = statusPath(line)
    try {
      const { mtimeMs } = fs.statSync(path.join(treePath, rel))
      oldest = oldest === null ? mtimeMs : Math.min(oldest, mtimeMs)
    } catch { /* deleted or unreadable */ }
  }
  return oldest
}

/**
 * Keeps only what has sat on this machine longer than `hours` — for a daily
 * reminder, today's fresh work is not news. Stashes carry no reliable time and are
 * always kept; a repo with no remote, or one git could not read, is always kept.
 */
export const olderThan = (r, hours, now = Date.now()) => {
  if (!hours) return r
  const cutoff = now - hours * 60 * 60 * 1000
  return {
    ...r,
    unpushed: r.unpushed.filter((u) => u.oldestMs <= cutoff),
    dirty: r.dirty.filter((d) => d.oldestMs === null || d.oldestMs <= cutoff)
  }
}

/**
 * Everything in one repo that exists only on this machine.
 *   unpushed: [{ branch, commits, oldestMs }]   commits on no remote
 *   dirty:    [{ path, branch, files, oldestMs }] worktrees with uncommitted or untracked files
 *   scratch:  [{ path, branch, entries }]       untracked scratch folders set aside (see SCRATCH_DIRS);
 *                                               not part of isClean, counted by the report
 *   stashes:  number                            stashes never leave the machine
 *   noRemote: boolean                           a repo with no remote at all — all of it is here only
 *   error:    string|null                       git could not answer; never read as clean
 *
 * `allWorktrees: false` checks only `repoPath` itself (start-check's fast path;
 * a checkout with dozens of worktrees would spend seconds on `git status` each).
 * `includeScratch: true` lists the scratch folders as uncommitted files again.
 */
export const scanRepo = (repoPath, { git = makeGit(repoPath), allWorktrees = true, includeScratch = false } = {}) => {
  const result = { repo: repoPath, unpushed: [], dirty: [], scratch: [], stashes: 0, noRemote: false, error: null }

  const remotes = git(['remote'])
  if (remotes === null) return { ...result, error: 'git could not read this repo' }
  result.noRemote = remotes === ''

  // With no remote at all every commit would list; the one noRemote line says it better.
  if (!result.noRemote) {
    const log = git(['log', '--branches', '--not', '--remotes', '--source', '--format=%S%x09%ct'])
    if (log === null) result.error = 'could not list unpushed commits'
    else result.unpushed = parseUnpushedLog(log)
  }

  const stash = git(['stash', 'list', '--format=%gd'])
  result.stashes = stash ? stash.split('\n').filter(Boolean).length : 0

  const trees = allWorktrees
    ? parseWorktrees(git(['worktree', 'list', '--porcelain'])).filter((t) => !t.prunable)
    : [{ path: repoPath, branch: git(['symbolic-ref', '--short', '-q', 'HEAD']) || null }]
  for (const tree of trees) {
    const status = makeGit(tree.path)(['status', '--porcelain'])
    if (status === null) continue // a missing worktree dir; `git worktree prune` territory, not unsaved work
    const all = status.split('\n').filter(Boolean)
    const lines = includeScratch ? all : all.filter((line) => !isScratchEntry(line))
    if (lines.length) result.dirty.push({ path: tree.path, branch: tree.branch, files: lines.length, oldestMs: oldestChange(tree.path, lines) })
    if (lines.length < all.length) {
      result.scratch.push({ path: tree.path, branch: tree.branch, entries: all.filter(isScratchEntry).map(statusPath) })
    }
  }
  return result
}

export const isClean = (r) => !r.error && !r.noRemote && !r.unpushed.length && !r.dirty.length && !r.stashes

const age = (ms, now) => {
  const days = Math.floor((now - ms) / DAY_MS)
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'}`
  const hours = Math.max(1, Math.floor((now - ms) / (60 * 60 * 1000)))
  return `${hours} hour${hours === 1 ? '' : 's'}`
}

/**
 * The lines a person reads. `cap` limits branch lines per repo (a machine with
 * hundreds of local branches must still print a short report).
 */
export const formatRepo = (r, { now = Date.now(), cap = 5, indent = '    ' } = {}) => {
  const lines = []
  if (r.error) lines.push(`${indent}? ${r.error} — not checked, not clean`)
  if (r.noRemote) lines.push(`${indent}ONLY HERE  this repo has no remote — none of it exists anywhere else`)
  const shown = r.unpushed.slice(0, cap)
  for (const row of shown) {
    lines.push(`${indent}ONLY HERE  ${row.branch} — ${row.commits} commit${row.commits === 1 ? '' : 's'} on no remote, oldest ${age(row.oldestMs, now)} — git push -u origin ${row.branch}`)
  }
  if (r.unpushed.length > shown.length) lines.push(`${indent}+${r.unpushed.length - shown.length} more branches with unpushed commits`)
  for (const d of r.dirty) {
    lines.push(`${indent}ONLY HERE  ${d.files} uncommitted file${d.files === 1 ? '' : 's'} in ${d.path}${d.branch ? ` (${d.branch})` : ''}${d.oldestMs ? `, oldest ${age(d.oldestMs, now)}` : ''} — commit them on a branch and push`)
  }
  if (r.stashes) lines.push(`${indent}ONLY HERE  ${r.stashes} stash${r.stashes === 1 ? '' : 'es'} — a stash never leaves this machine; make it a branch (git stash branch <name>) and push`)
  return lines
}

/** Every git repo at or under `dir`, not descending into node_modules or into a repo's own tree. */
export const findRepos = (dir, { maxDepth = 4 } = {}) => {
  const found = []
  const walk = (current, depth) => {
    let entries
    try { entries = fs.readdirSync(current, { withFileTypes: true }) } catch { return }
    if (entries.some((e) => e.name === '.git')) {
      // A `.git` FILE is a linked worktree; its main repo reports it, so skip it here.
      const gitEntry = entries.find((e) => e.name === '.git')
      if (gitEntry.isDirectory()) found.push(current)
      return
    }
    if (depth >= maxDepth) return
    for (const e of entries) {
      if (!e.isDirectory() || e.name === 'node_modules' || e.name.startsWith('.')) continue
      walk(path.join(current, e.name), depth + 1)
    }
  }
  walk(path.resolve(dir), 0)
  return found
}
