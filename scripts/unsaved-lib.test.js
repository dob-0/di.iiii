import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { findRepos, formatRepo, isClean, oldestChange, olderThan, parseUnpushedLog, parseWorktrees, scanRepo } from './unsaved-lib.mjs'
import { logPreamble, parseArgs, summaryLine } from './unsaved.mjs'

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
    expect(r.dirty).toEqual([{ path: repo, branch: 'feat/lights', files: 1, oldestMs: expect.any(Number) }])
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

describe('the daily watch: only what has sat here a while', () => {
  const HOUR = 60 * 60 * 1000
  const now = 1_000 * HOUR
  const r = {
    repo: '/r', error: null, noRemote: false, stashes: 0,
    unpushed: [{ branch: 'old', commits: 2, oldestMs: now - 30 * HOUR }, { branch: 'today', commits: 1, oldestMs: now - 2 * HOUR }],
    dirty: [{ path: '/r', branch: 'old', files: 3, oldestMs: now - 48 * HOUR }, { path: '/r2', branch: 'x', files: 1, oldestMs: now - HOUR },
      { path: '/r3', branch: 'y', files: 1, oldestMs: null }]
  }

  it('drops today\'s work and keeps what is older than the limit', () => {
    const kept = olderThan(r, 24, now)
    expect(kept.unpushed.map((u) => u.branch)).toEqual(['old'])
    expect(kept.dirty.map((d) => d.path)).toEqual(['/r', '/r3']) // unknown age is never hidden
  })

  it('is a no-op without a limit', () => {
    expect(olderThan(r, 0, now)).toBe(r)
  })

  it('reads the age of uncommitted files from the disk, skipping deleted ones', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'age-'))
    fs.writeFileSync(path.join(dir, 'a b.txt'), 'x')
    const past = new Date(Date.now() - 5 * HOUR)
    fs.utimesSync(path.join(dir, 'a b.txt'), past, past)
    fs.writeFileSync(path.join(dir, 'new.txt'), 'y')
    const oldest = oldestChange(dir, [' M "a b.txt"', '?? new.txt', ' D gone.txt', 'R  old.txt -> new.txt'])
    expect(Math.abs(oldest - past.getTime())).toBeLessThan(2000)
    expect(oldestChange(dir, [' D gone.txt'])).toBeNull()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('parses the watch flags and folders', () => {
    expect(parseArgs(['--older-than', '24', '--notify', '--log', '/l', '/a', '/b'])).toEqual({ json: false, notify: true, olderThan: 24, log: '/l', includeScratch: false, dirs: ['/a', '/b'] })
  })

  it('reads --include-scratch', () => {
    expect(parseArgs(['--include-scratch', '/a']).includeScratch).toBe(true)
  })

  it('says in one line what a notification can hold', () => {
    expect(summaryLine([{}, {}], [])).toBe('2 repos hold work that exists only on this machine')
    expect(summaryLine([{}], [{}])).toBe('1 repo holds work that exists only on this machine; 1 repo could not be checked')
  })
})

describe('the watch log on Windows', () => {
  it('starts with a UTF-8 BOM there, so Windows PowerShell 5.1 reads "—" right', () => {
    expect(logPreamble('win32')).toBe('\uFEFF')
    expect(logPreamble('linux')).toBe('')
    expect(logPreamble('darwin')).toBe('')
  })
})

// 2026-10-09: 23 of the 59 worktrees the daily report listed held nothing but an untracked
// `.verify/` folder (a worker's screenshots and one-off check scripts) and the report told a
// person to "commit them on a branch and push" 23 times, so the 35 lines that were real work
// (and 5 branches with commits on no remote) sat in a list of 65. Real git, as above.
describe('scratch folders a verification run leaves untracked', () => {
  const UNSAVED = path.resolve(import.meta.dirname, 'unsaved.mjs')
  const withScratch = (name) => {
    const repo = makeRepoWithRemote(name)
    fs.mkdirSync(path.join(repo, '.verify'))
    fs.writeFileSync(path.join(repo, '.verify', 'shot.png'), 'png')
    return repo
  }

  it('is clean when the only untracked thing is a .verify/ folder, and says what it set aside', () => {
    const repo = withScratch('scratch-only')
    const r = scanRepo(repo)
    expect(r.dirty).toEqual([])
    expect(r.scratch).toEqual([{ path: repo, branch: 'dev', entries: ['.verify/'] }])
    expect(isClean(r)).toBe(true)
  })

  it('still reports real files next to it, and does not count the folder among them', () => {
    const repo = withScratch('scratch-and-work')
    fs.writeFileSync(path.join(repo, 'work.txt'), 'w\n')
    const r = scanRepo(repo)
    expect(r.dirty).toEqual([{ path: repo, branch: 'dev', files: 1, oldestMs: expect.any(Number) }])
    expect(r.scratch.map((s) => s.entries)).toEqual([['.verify/']])
    expect(isClean(r)).toBe(false)
  })

  it('lists the folder again when asked (the report as it was before 2026-10-10)', () => {
    const repo = withScratch('scratch-included')
    const r = scanRepo(repo, { includeScratch: true })
    expect(r.dirty).toEqual([{ path: repo, branch: 'dev', files: 1, oldestMs: expect.any(Number) }])
    expect(r.scratch).toEqual([])
    expect(isClean(r)).toBe(false)
  })

  it('sets aside only a wholly untracked folder: a tracked file in it, edited, is still work', () => {
    const repo = makeRepoWithRemote('scratch-tracked')
    fs.mkdirSync(path.join(repo, '.verify'))
    fs.writeFileSync(path.join(repo, '.verify', 'kept.txt'), 'v1\n')
    run(repo, 'add', '.')
    run(repo, 'commit', '-q', '-m', 'committed by mistake')
    run(repo, 'push', '-q', 'origin', 'dev')
    fs.writeFileSync(path.join(repo, '.verify', 'kept.txt'), 'v2\n')       //  M .verify/kept.txt
    fs.writeFileSync(path.join(repo, '.verify', 'new.txt'), 'n\n')         // ?? .verify/new.txt
    const r = scanRepo(repo)
    expect(r.dirty.map((d) => d.files)).toEqual([2])
    expect(r.scratch).toEqual([])
  })

  it('does not take a FILE named .verify for the folder', () => {
    const repo = makeRepoWithRemote('scratch-file')
    fs.writeFileSync(path.join(repo, '.verify'), 'a file, not the folder\n')
    const r = scanRepo(repo)
    expect(r.dirty.map((d) => d.files)).toEqual([1])
    expect(r.scratch).toEqual([])
  })

  it('sets aside a __pycache__/ inside a tracked folder (Python bytecode of scripts/place)', () => {
    const repo = makeRepoWithRemote('scratch-pycache')
    fs.mkdirSync(path.join(repo, 'scripts', 'place'), { recursive: true })
    fs.writeFileSync(path.join(repo, 'scripts', 'place', 'hall.py'), 'print(1)\n')
    run(repo, 'add', '.')
    run(repo, 'commit', '-q', '-m', 'hall')
    run(repo, 'push', '-q', 'origin', 'dev')
    fs.mkdirSync(path.join(repo, 'scripts', 'place', '__pycache__'))
    fs.writeFileSync(path.join(repo, 'scripts', 'place', '__pycache__', 'hall.cpython-312.pyc'), 'x')
    const r = scanRepo(repo)
    expect(r.dirty).toEqual([])
    expect(r.scratch.map((s) => s.entries)).toEqual([['scripts/place/__pycache__/']])
  })

  it('keeps the set-aside folders in what the watch hands to another script (--json)', () => {
    const repo = withScratch('scratch-json')
    fs.writeFileSync(path.join(repo, 'work.txt'), 'w\n')
    const out = spawnSync('node', [UNSAVED, '--json', repo], { encoding: 'utf8' })
    const [row] = JSON.parse(out.stdout).repos
    expect(row.scratch.map((s) => s.entries)).toEqual([['.verify/']])
    expect(row.dirty.map((d) => d.files)).toEqual([1])
  })

  describe('the report itself (node scripts/unsaved.mjs)', () => {
    const report = (folder, ...flags) => {
      const r = spawnSync('node', [UNSAVED, ...flags, folder], { encoding: 'utf8' })
      return { code: r.status, text: r.stdout }
    }
    const folderWith = (name, build) => {
      const folder = path.join(tmp, name)
      fs.mkdirSync(folder)
      const repo = path.join(folder, 'one')
      const remote = path.join(folder, 'one.git')
      run(folder, 'init', '-q', '--bare', '-b', 'dev', remote)
      run(folder, 'init', '-q', '-b', 'dev', repo)
      run(repo, 'remote', 'add', 'origin', remote)
      fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n')
      run(repo, 'add', '.')
      run(repo, 'commit', '-q', '-m', 'first')
      run(repo, 'push', '-q', 'origin', 'dev')
      build(repo)
      return folder
    }

    it('says SAVED and exits 0 when the only thing left is a scratch folder, and still counts it', () => {
      const folder = folderWith('report-scratch-only', (repo) => {
        fs.mkdirSync(path.join(repo, '.verify'))
        fs.writeFileSync(path.join(repo, '.verify', 'shot.png'), 'png')
      })
      const { code, text } = report(folder)
      expect(text).toContain('SAVED')
      expect(text).not.toContain('commit them on a branch and push')
      expect(text).toContain('Set aside: 1 untracked scratch folder (.verify/) in 1 worktree')
      expect(code).toBe(0)
    })

    it('with --include-scratch it is the old report: ONLY ON THIS MACHINE, exit 1', () => {
      const folder = folderWith('report-scratch-included', (repo) => {
        fs.mkdirSync(path.join(repo, '.verify'))
        fs.writeFileSync(path.join(repo, '.verify', 'shot.png'), 'png')
      })
      const { code, text } = report(folder, '--include-scratch')
      expect(text).toContain('ONLY ON THIS MACHINE')
      expect(text).toContain('1 uncommitted file')
      expect(text).not.toContain('Set aside')
      expect(code).toBe(1)
    })

    it('real work next to a scratch folder is still reported, and the folder is not one of its files', () => {
      const folder = folderWith('report-scratch-and-work', (repo) => {
        fs.mkdirSync(path.join(repo, '.verify'))
        fs.writeFileSync(path.join(repo, '.verify', 'shot.png'), 'png')
        fs.writeFileSync(path.join(repo, 'work.txt'), 'w\n')
      })
      const { code, text } = report(folder)
      expect(text).toContain('ONLY ON THIS MACHINE')
      expect(text).toContain('1 uncommitted file in')
      expect(text).toContain('Set aside: 1 untracked scratch folder (.verify/) in 1 worktree')
      expect(code).toBe(1)
    })
  })
})
