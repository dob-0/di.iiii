import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { findRepos, formatRepo, isClean, parseUnpushedLog, parseWorktrees, scanRepo } from './unsaved-lib.mjs'

// Real git in a temp dir, no mocks: the whole point of this lib is to read git
// exactly as a person's machine holds it, so the test builds that machine.
const HOOKS_DIR = path.resolve(import.meta.dirname, 'git-hooks')
const run = (cwd, ...args) => execFileSync('git', args, {
  cwd,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' }
}).trim()
const tryRun = (cwd, ...args) => {
  try { return { ok: true, out: run(cwd, ...args) } } catch (e) { return { ok: false, out: `${e.stdout}${e.stderr}` } }
}

let tmp
beforeAll(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'unsaved-')) })
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

const makeRepoWithRemote = (name) => {
  const remote = path.join(tmp, `${name}.git`)
  const repo = path.join(tmp, name)
  run(tmp, 'init', '-q', '--bare', '-b', 'dev', remote)
  run(tmp, 'init', '-q', '-b', 'dev', repo)
  run(repo, 'remote', 'add', 'origin', remote)
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n')
  run(repo, 'add', '.')
  run(repo, 'commit', '-q', '-m', 'first')
  run(repo, 'push', '-q', 'origin', 'dev')
  return repo
}

describe('parseUnpushedLog', () => {
  it('groups commits by the branch that reaches them and keeps the oldest time', () => {
    const rows = parseUnpushedLog('refs/heads/feat/a\t200\nrefs/heads/feat/a\t100\nrefs/heads/fix/b\t300\n')
    expect(rows).toEqual([
      { branch: 'feat/a', commits: 2, oldestMs: 100_000 },
      { branch: 'fix/b', commits: 1, oldestMs: 300_000 }
    ])
  })

  it('reads empty output as nothing unpushed', () => {
    expect(parseUnpushedLog('')).toEqual([])
  })
})

describe('parseWorktrees', () => {
  it('reads paths, branches and prunable trees', () => {
    const out = 'worktree /a\nHEAD 1\nbranch refs/heads/dev\n\nworktree /b\nHEAD 2\ndetached\n\nworktree /c\nHEAD 3\nbranch refs/heads/x\nprunable gitdir file points to non-existent location\n'
    expect(parseWorktrees(out)).toEqual([
      { path: '/a', branch: 'dev', prunable: false },
      { path: '/b', branch: null, prunable: false },
      { path: '/c', branch: 'x', prunable: true }
    ])
  })
})

describe('scanRepo on a real repo', () => {
  it('is clean when everything is pushed', () => {
    const repo = makeRepoWithRemote('clean')
    const r = scanRepo(repo)
    expect(r.error).toBeNull()
    expect(isClean(r)).toBe(true)
  })

  it('names an unpushed branch, a dirty worktree and a stash', () => {
    const repo = makeRepoWithRemote('busy')
    run(repo, 'switch', '-q', '-c', 'feat/lights')
    fs.writeFileSync(path.join(repo, 'b.txt'), 'b\n')
    run(repo, 'add', '.')
    run(repo, 'commit', '-q', '-m', 'lights')
    fs.writeFileSync(path.join(repo, 'a.txt'), 'changed\n')
    run(repo, 'stash', '-q')
    fs.writeFileSync(path.join(repo, 'new.txt'), 'untracked\n')

    const r = scanRepo(repo)
    expect(r.unpushed.map((u) => [u.branch, u.commits])).toEqual([['feat/lights', 1]])
    expect(r.stashes).toBe(1)
    expect(r.dirty).toEqual([{ path: repo, branch: 'feat/lights', files: 1 }])
    expect(isClean(r)).toBe(false)

    const text = formatRepo(r).join('\n')
    expect(text).toContain('feat/lights — 1 commit on no remote')
    expect(text).toContain('git push -u origin feat/lights')
    expect(text).toContain('1 stash')
  })

  it('treats a repo with no remote as all-here, without listing every commit', () => {
    const repo = path.join(tmp, 'lonely')
    run(tmp, 'init', '-q', '-b', 'main', repo)
    fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n')
    run(repo, 'add', '.')
    run(repo, 'commit', '-q', '-m', 'first')
    const r = scanRepo(repo)
    expect(r.noRemote).toBe(true)
    expect(r.unpushed).toEqual([])
    expect(formatRepo(r).join('\n')).toContain('no remote')
  })

  it('reports a folder git cannot read as an error, never as clean', () => {
    const r = scanRepo(path.join(tmp, 'does-not-exist'))
    expect(r.error).toBeTruthy()
    expect(isClean(r)).toBe(false)
  })
})

describe('findRepos', () => {
  it('finds repos under a folder and skips linked worktrees', () => {
    const root = path.join(tmp, 'home')
    fs.mkdirSync(path.join(root, 'dev'), { recursive: true })
    run(root, 'init', '-q', '-b', 'dev', path.join(root, 'dev', 'one'))
    run(root, 'init', '-q', '-b', 'dev', path.join(root, 'two'))
    fs.mkdirSync(path.join(root, 'wt'))
    fs.writeFileSync(path.join(root, 'wt', '.git'), 'gitdir: elsewhere\n')
    expect(findRepos(root).sort()).toEqual([path.join(root, 'dev', 'one'), path.join(root, 'two')].sort())
  })
})

describe('git hooks (scripts/git-hooks)', () => {
  const hooked = (name) => {
    const repo = makeRepoWithRemote(name)
    run(repo, 'config', 'core.hooksPath', HOOKS_DIR)
    return repo
  }

  it('refuses a commit straight on dev and allows it on a branch', () => {
    const repo = hooked('hook-commit')
    fs.writeFileSync(path.join(repo, 'a.txt'), 'x\n')
    run(repo, 'add', '.')
    const onDev = tryRun(repo, 'commit', '-q', '-m', 'on dev')
    expect(onDev.ok).toBe(false)
    expect(onDev.out).toContain('REFUSED')
    run(repo, 'switch', '-q', '-c', 'fix/x')
    expect(tryRun(repo, 'commit', '-q', '-m', 'on a branch').ok).toBe(true)
  })

  it('install-git-hooks.mjs covers a checkout whose branch predates the hooks', () => {
    // 2026-09-29: with core.hooksPath = scripts/git-hooks (relative), the main checkout
    // parked on an old dev had no hooks and a commit on dev went through.
    const repo = makeRepoWithRemote('hook-install')          // dev = a commit with no scripts/
    run(repo, 'switch', '-q', '-c', 'feat/with-hooks')
    fs.mkdirSync(path.join(repo, 'scripts', 'git-hooks'), { recursive: true })
    for (const name of ['pre-commit', 'pre-push']) {
      fs.copyFileSync(path.join(HOOKS_DIR, name), path.join(repo, 'scripts', 'git-hooks', name))
    }
    fs.copyFileSync(path.join(HOOKS_DIR, '..', 'install-git-hooks.mjs'), path.join(repo, 'scripts', 'install-git-hooks.mjs'))
    run(repo, 'add', '.')
    run(repo, 'commit', '-q', '-m', 'hooks')
    const env = { ...process.env, CI: '', DI_NO_GIT_HOOKS: '' }
    delete env.CI
    execFileSync('node', [path.join(repo, 'scripts', 'install-git-hooks.mjs')], { cwd: repo, env, stdio: 'pipe' })
    const hooksPath = run(repo, 'config', '--get', 'core.hooksPath')
    expect(hooksPath.endsWith('/di-hooks')).toBe(true)
    expect(path.isAbsolute(hooksPath)).toBe(true)

    run(repo, 'switch', '-q', 'dev')                       // this tree has no scripts/ at all
    expect(fs.existsSync(path.join(repo, 'scripts'))).toBe(false)
    const onDev = tryRun(repo, 'commit', '-q', '--allow-empty', '-m', 'on dev')
    expect(onDev.ok).toBe(false)
    expect(onDev.out).toContain('REFUSED')
  })

  it('refuses a push that would write dev or main on the remote', () => {
    const repo = hooked('hook-push')
    run(repo, 'switch', '-q', '-c', 'fix/y')
    fs.writeFileSync(path.join(repo, 'y.txt'), 'y\n')
    run(repo, 'add', '.')
    run(repo, 'commit', '-q', '-m', 'y')
    for (const target of ['dev', 'main']) {
      const pushed = tryRun(repo, 'push', 'origin', `fix/y:${target}`)
      expect(pushed.ok).toBe(false)
      expect(pushed.out).toContain('REFUSED')
    }
  })
})
