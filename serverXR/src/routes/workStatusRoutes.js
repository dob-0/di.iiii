const os = require('node:os')
const path = require('node:path')
const fsPromises = require('node:fs/promises')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const { requireDevLocal } = require('../devLocalGuard')

const execFileAsync = promisify(execFile)
const CACHE_TTL_MS = 5000
const CHILD_TIMEOUT_MS = 4000

// Every child process is argv-only (never a shell string) and time-boxed —
// this route runs local operator tools (git/gh) on request, and a hung
// `gh` call (bad auth, network) must degrade its own section, not the route.
async function run(cmd, args, cwd) {
  try {
    const { stdout } = await execFileAsync(cmd, args, { cwd, timeout: CHILD_TIMEOUT_MS, maxBuffer: 1024 * 1024 })
    return stdout
  } catch {
    return null
  }
}

async function readNoteHead(filePath, maxLines = 40) {
  try {
    const text = await fsPromises.readFile(filePath, 'utf8')
    const lines = text.split('\n').slice(0, maxLines)
    return { path: filePath, lines }
  } catch {
    return null
  }
}

async function listSessions(claudeDir, limit = 10) {
  const jobsDir = path.join(claudeDir, 'jobs')
  let entries
  try {
    entries = await fsPromises.readdir(jobsDir, { withFileTypes: true })
  } catch {
    return []
  }
  const dirs = entries.filter((entry) => entry.isDirectory())
  const stats = await Promise.all(dirs.map(async (entry) => {
    try {
      const stat = await fsPromises.stat(path.join(jobsDir, entry.name))
      return { id: entry.name, updatedAt: stat.mtime.toISOString() }
    } catch {
      return null
    }
  }))
  return stats
    .filter(Boolean)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, limit)
}

async function listWorktrees(repoDir) {
  const porcelain = await run('git', ['worktree', 'list', '--porcelain'], repoDir)
  if (!porcelain) return []
  const trees = []
  let current = null
  for (const line of porcelain.split('\n')) {
    if (line.startsWith('worktree ')) {
      current = { path: line.slice('worktree '.length).trim() }
      trees.push(current)
    } else if (current && line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length).replace('refs/heads/', '').trim()
    } else if (current && line === 'detached') {
      current.branch = '(detached)'
    }
  }
  await Promise.all(trees.map(async (tree) => {
    const status = await run('git', ['status', '-sb', '--porcelain=v2'], tree.path)
    if (!status) {
      tree.dirty = null
      return
    }
    const lines = status.split('\n').filter(Boolean)
    tree.dirtyCount = lines.filter((line) => !line.startsWith('#')).length
    const branchLine = lines.find((line) => line.startsWith('# branch.ab'))
    if (branchLine) {
      const match = branchLine.match(/\+(\d+) -(\d+)/)
      if (match) {
        tree.ahead = Number(match[1])
        tree.behind = Number(match[2])
      }
    }
  }))
  return trees
}

async function listPullRequests(repo) {
  if (!repo) return null
  const stdout = await run('gh', ['pr', 'list', '--repo', repo, '--json', 'number,title,headRefName,isDraft,statusCheckRollup', '--limit', '15'])
  if (!stdout) return null
  try {
    return JSON.parse(stdout)
  } catch {
    return null
  }
}

async function listDeploys(repo) {
  if (!repo) return null
  const stdout = await run('gh', ['run', 'list', '--repo', repo, '--limit', '5', '--json', 'name,status,conclusion,headBranch'])
  if (!stdout) return null
  try {
    return JSON.parse(stdout)
  } catch {
    return null
  }
}

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')

function registerWorkStatusRoutes(router, {
  repo = 'dob-0/di.iiii',
  repoDir = REPO_ROOT,
  claudeDir = path.join(os.homedir(), '.claude'),
  homeDir = os.homedir()
} = {}) {
  let cache = null
  let cacheAt = 0

  router.get('/api/work-status', requireDevLocal, async (req, res, next) => {
    try {
      if (cache && Date.now() - cacheAt < CACHE_TTL_MS) {
        res.json(cache)
        return
      }
      const [sessions, worktrees, prs, deploys, currentNote, progressNote, openThreadsNote] = await Promise.all([
        listSessions(claudeDir),
        listWorktrees(repoDir),
        listPullRequests(repo),
        listDeploys(repo),
        readNoteHead(path.join(repoDir, 'CURRENT.md')),
        readNoteHead(path.join(repoDir, 'PROGRESS.md')),
        readNoteHead(path.join(homeDir, 'OPEN_THREADS.md'))
      ])
      cache = {
        sessions,
        worktrees,
        prs,
        deploys,
        notes: [currentNote, progressNote, openThreadsNote].filter(Boolean),
        generatedAt: new Date().toISOString()
      }
      cacheAt = Date.now()
      res.json(cache)
    } catch (error) {
      next(error)
    }
  })
}

module.exports = { registerWorkStatusRoutes }
