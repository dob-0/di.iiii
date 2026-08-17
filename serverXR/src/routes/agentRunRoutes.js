const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawn } = require('node:child_process')
const { requireDevLocal } = require('../devLocalGuard')

const TAIL_MAX_BYTES = 8 * 1024
const RUN_TTL_MS = 1000 * 60 * 60 // stale runs fall out of the list after an hour

// Launched processes may only start inside a di.iiii checkout — never an
// arbitrary caller-supplied cwd. Matches the base checkout and every
// worktree (`di.iiii-<name>`), not just the exact home directory string.
function isAllowedCwd(candidate, homeDir) {
  const resolved = path.resolve(candidate)
  const base = path.join(homeDir, 'di.iiii')
  return resolved === base || resolved.startsWith(`${base}-`) || resolved.startsWith(`${base}/`)
}

function registerAgentRunRoutes(router, {
  homeDir = os.homedir(),
  defaultCwd = path.join(os.homedir(), 'di.iiii'),
  claudeBin = 'claude'
} = {}) {
  const runs = new Map()

  function sweepStaleRuns() {
    const now = Date.now()
    for (const [id, run] of runs) {
      if (run.status === 'running') continue
      const finishedAt = run.endedAt ? new Date(run.endedAt).getTime() : 0
      if (now - finishedAt > RUN_TTL_MS) runs.delete(id)
    }
  }

  function toSummary(run) {
    return {
      id: run.id,
      prompt: run.prompt,
      cwd: run.cwd,
      status: run.status,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      tail: run.tail.slice(-TAIL_MAX_BYTES)
    }
  }

  router.post('/api/agent-runs', requireDevLocal, (req, res) => {
    const prompt = String(req.body?.prompt || '').trim()
    if (!prompt) {
      res.status(400).json({ error: 'prompt is required' })
      return
    }
    const requestedCwd = req.body?.cwd ? String(req.body.cwd) : defaultCwd
    if (!isAllowedCwd(requestedCwd, homeDir)) {
      res.status(400).json({ error: 'cwd is outside the allowed di.iiii worktrees' })
      return
    }

    const id = crypto.randomUUID()
    const run = {
      id,
      prompt,
      cwd: path.resolve(requestedCwd),
      status: 'running',
      startedAt: new Date().toISOString(),
      endedAt: null,
      tail: '',
      child: null
    }
    runs.set(id, run)

    // argv-only, never shell:true — the prompt travels as one argv element,
    // so nothing in it can be interpreted as a shell operator.
    const child = spawn(claudeBin, ['-p', prompt, '--output-format', 'stream-json', '--verbose'], {
      cwd: run.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false
    })
    run.child = child

    const appendTail = (chunk) => {
      run.tail = (run.tail + chunk.toString('utf8')).slice(-TAIL_MAX_BYTES)
    }
    child.stdout.on('data', appendTail)
    child.stderr.on('data', appendTail)
    child.on('error', (error) => {
      run.status = 'failed'
      run.endedAt = new Date().toISOString()
      appendTail(`\n[spawn error] ${error.message}`)
    })
    child.on('exit', (code, signal) => {
      run.endedAt = new Date().toISOString()
      if (run.status === 'stopped') return
      run.status = signal || code !== 0 ? 'failed' : 'done'
    })

    sweepStaleRuns()
    res.json({ runId: id })
  })

  router.get('/api/agent-runs', requireDevLocal, (req, res) => {
    sweepStaleRuns()
    res.json({ runs: Array.from(runs.values()).map(toSummary) })
  })

  router.get('/api/agent-runs/:id', requireDevLocal, (req, res) => {
    const run = runs.get(req.params.id)
    if (!run) {
      res.status(404).json({ error: 'Not found.' })
      return
    }
    res.json(toSummary(run))
  })

  router.post('/api/agent-runs/:id/stop', requireDevLocal, (req, res) => {
    const run = runs.get(req.params.id)
    if (!run) {
      res.status(404).json({ error: 'Not found.' })
      return
    }
    if (run.status === 'running' && run.child) {
      run.status = 'stopped'
      run.endedAt = new Date().toISOString()
      run.child.kill('SIGTERM')
    }
    res.json(toSummary(run))
  })
}

module.exports = { registerAgentRunRoutes }
