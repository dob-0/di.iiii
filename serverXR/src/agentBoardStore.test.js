// @vitest-environment node

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createAgentBoardStore } = require('./agentBoardStore.js')
const { isLocalOperatorRequest } = require('./routes/agentBoardRoutes.js')

const SESSION_ID = '2f85e3cf-0000-4ec5-b75d-043cd693e835'
const DEAD_SESSION_ID = 'dead0000-0000-4ec5-b75d-043cd693e835'

let tempDirs = []

async function makeClaudeHome() {
  const home = await mkdtemp(path.join(os.tmpdir(), 'agent-board-'))
  tempDirs.push(home)
  const projectDir = path.join(home, 'projects', '-home-user')
  await mkdir(projectDir, { recursive: true })

  const lines = [
    { type: 'ai-title', aiTitle: 'Machine title' },
    { type: 'custom-title', customTitle: 'Chosen title' },
    {
      type: 'worktree-state',
      worktreeSession: { worktreePath: '/home/user/repo-tree', worktreeBranch: 'feat/thing', worktreeName: 'thing' }
    },
    { type: 'pr-link', prNumber: 42, prUrl: 'https://github.com/x/y/pull/42' },
    {
      parentUuid: null,
      type: 'user',
      uuid: 'u-1',
      cwd: '/home/user',
      gitBranch: 'dev',
      timestamp: '2026-08-08T10:00:00.000Z',
      message: { role: 'user', content: 'hello agent' }
    },
    {
      parentUuid: 'u-1',
      type: 'assistant',
      uuid: 'a-1',
      cwd: '/home/user',
      gitBranch: 'dev',
      timestamp: '2026-08-08T10:00:05.000Z',
      message: {
        role: 'assistant',
        model: 'claude-opus-5',
        content: [{ type: 'text', text: 'hello human' }, { type: 'tool_use', name: 'Bash' }]
      }
    },
    // resumed sessions re-serialize prior entries: same uuid must not duplicate
    {
      parentUuid: 'u-1',
      type: 'assistant',
      uuid: 'a-1',
      timestamp: '2026-08-08T10:00:05.000Z',
      message: { role: 'assistant', model: 'claude-opus-5', content: [{ type: 'text', text: 'hello human' }] }
    },
    { type: 'system', subtype: 'turn_duration', messageCount: 7, durationMs: 1200 }
  ]
  await writeFile(
    path.join(projectDir, `${SESSION_ID}.jsonl`),
    lines.map((line) => JSON.stringify(line)).join('\n')
  )

  const subagentsDir = path.join(projectDir, SESSION_ID, 'subagents')
  await mkdir(subagentsDir, { recursive: true })
  await writeFile(
    path.join(subagentsDir, 'agent-abc123.meta.json'),
    JSON.stringify({ agentType: 'Explore', description: 'survey the code', parentAgentId: null, spawnDepth: 1 })
  )
  await writeFile(path.join(subagentsDir, 'agent-abc123.jsonl'), '{"type":"user"}\n')

  const sessionsDir = path.join(home, 'sessions')
  await mkdir(sessionsDir, { recursive: true })
  // this test's own pid is definitionally alive; 2^22 exceeds linux pid_max defaults
  await writeFile(
    path.join(sessionsDir, '1.json'),
    JSON.stringify({ pid: process.pid, sessionId: SESSION_ID, cwd: '/home/user', kind: 'interactive', status: 'busy' })
  )
  await writeFile(
    path.join(sessionsDir, '2.json'),
    JSON.stringify({ pid: 4194304 + 1, sessionId: DEAD_SESSION_ID, kind: 'bg', status: 'idle' })
  )

  const jobDir = path.join(home, 'jobs', SESSION_ID.slice(0, 8))
  await mkdir(jobDir, { recursive: true })
  await writeFile(
    path.join(jobDir, 'state.json'),
    JSON.stringify({ state: 'working', tempo: 'steady', output: { result: 'done thing' }, children: [] })
  )

  return home
}

afterEach(async () => {
  for (const dir of tempDirs) {
    await rm(dir, { recursive: true, force: true })
  }
  tempDirs = []
})

describe('agentBoardStore', () => {
  it('indexes sessions with title, worktree, branch, counts and live overlay', async () => {
    const store = createAgentBoardStore({ claudeHome: await makeClaudeHome() })
    const board = await store.getBoard()

    expect(board.totalSessions).toBe(1)
    expect(board.sessions).toHaveLength(1)
    const session = board.sessions[0]
    expect(session.sessionId).toBe(SESSION_ID)
    expect(session.title).toBe('Chosen title') // custom-title wins over ai-title
    expect(session.branch).toBe('feat/thing') // worktree branch wins over gitBranch
    expect(session.worktreePath).toBe('/home/user/repo-tree')
    expect(session.prNumber).toBe(42)
    expect(session.model).toBe('claude-opus-5')
    expect(session.messageCount).toBe(7)
    expect(session.live).toEqual({ pid: process.pid, kind: 'interactive', status: 'busy' })

    // the dead pid's record is a stale file, not a live session
    expect(board.live.map((entry) => entry.sessionId)).toEqual([SESSION_ID])
  })

  it('reads detail: deduped tail, subagent tree, job state', async () => {
    const store = createAgentBoardStore({ claudeHome: await makeClaudeHome() })
    const detail = await store.getSessionDetail(SESSION_ID)

    expect(detail.tail).toEqual([
      { role: 'user', text: 'hello agent', timestamp: '2026-08-08T10:00:00.000Z' },
      { role: 'assistant', text: 'hello human', timestamp: '2026-08-08T10:00:05.000Z' }
    ])
    expect(detail.subagents).toHaveLength(1)
    expect(detail.subagents[0]).toMatchObject({
      agentId: 'agent-abc123',
      agentType: 'Explore',
      description: 'survey the code',
      spawnDepth: 1
    })
    expect(detail.job).toMatchObject({ state: 'working', result: 'done thing' })
  })

  it('returns null detail for an unknown session', async () => {
    const store = createAgentBoardStore({ claudeHome: await makeClaudeHome() })
    expect(await store.getSessionDetail('ffffffff-0000-4ec5-b75d-000000000000')).toBeNull()
  })

  it('returns an empty board when the claude home does not exist', async () => {
    const store = createAgentBoardStore({ claudeHome: '/nonexistent/never' })
    const board = await store.getBoard()
    expect(board.sessions).toEqual([])
    expect(board.live).toEqual([])
  })
})

describe('agent board local-operator guard', () => {
  const request = (address) => ({ socket: { remoteAddress: address } })

  it('allows loopback in non-production and nothing else', () => {
    const previous = process.env.NODE_ENV
    try {
      process.env.NODE_ENV = 'test'
      expect(isLocalOperatorRequest(request('127.0.0.1'))).toBe(true)
      expect(isLocalOperatorRequest(request('::1'))).toBe(true)
      expect(isLocalOperatorRequest(request('::ffff:127.0.0.1'))).toBe(true)
      expect(isLocalOperatorRequest(request('192.168.88.10'))).toBe(false)
      expect(isLocalOperatorRequest({})).toBe(false)

      process.env.NODE_ENV = 'production'
      expect(isLocalOperatorRequest(request('127.0.0.1'))).toBe(false)
    } finally {
      process.env.NODE_ENV = previous
    }
  })

  it('DI_LOCAL=1 reopens a production gate, but only over loopback', () => {
    const previousEnv = process.env.NODE_ENV
    const previousLocal = process.env.DI_LOCAL
    try {
      process.env.NODE_ENV = 'production'
      process.env.DI_LOCAL = '1'
      expect(isLocalOperatorRequest(request('127.0.0.1'))).toBe(true)
      expect(isLocalOperatorRequest(request('::1'))).toBe(true)
      expect(isLocalOperatorRequest(request('192.168.88.10'))).toBe(false)
      expect(isLocalOperatorRequest({})).toBe(false)

      process.env.DI_LOCAL = ''
      expect(isLocalOperatorRequest(request('127.0.0.1'))).toBe(false)
    } finally {
      process.env.NODE_ENV = previousEnv
      if (previousLocal === undefined) delete process.env.DI_LOCAL
      else process.env.DI_LOCAL = previousLocal
    }
  })
})
