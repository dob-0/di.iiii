import { describe, expect, it, vi, beforeEach } from 'vitest'

// start-check.mjs imports getState from repo-state.mjs and listSpaces/
// readSignatures/readBaseline/TIERS/localBase from tier-sync.mjs. Mocking
// both lets these tests drive checkCode()/checkSpaces() through every shape
// the plan asks for (up-to-date, behind, fork-behind, space-newer-on-dev,
// tier-unreachable) without a real git remote or a real server — this repo
// has no permission to write to any live tier, and start-check itself must
// stay read-only, so a mock is the only honest way to exercise "dev has
// newer work" here.
vi.mock('./repo-state.mjs', () => ({ getState: vi.fn() }))
vi.mock('./tier-sync.mjs', () => ({
  TIERS: { local: { base: 'http://localhost:4000/serverXR', tokenKey: 'API_TOKEN' }, staging: { base: 'https://staging.di-studio.xyz/serverXR', tokenKey: 'LIVE_API_TOKEN' } },
  localBase: () => 'http://localhost:4000/serverXR',
  listSpaces: vi.fn(),
  readSignatures: vi.fn(),
  readBaseline: vi.fn(() => ({}))
}))

const childProcess = vi.hoisted(() => ({ execFileSync: vi.fn() }))
vi.mock('node:child_process', () => ({
  execFileSync: childProcess.execFileSync,
  default: { execFileSync: childProcess.execFileSync }
}))

import { getState } from './repo-state.mjs'
import { listSpaces, readSignatures, readBaseline } from './tier-sync.mjs'
import { checkCode, checkSpaces, classifyProjectDrift, formatReport } from './start-check.mjs'

const sig = (hash, shape = hash) => ({ hash, shape, entities: 0, nodes: 0, assets: 0, page: 0 })

describe('classifyProjectDrift', () => {
  it('is quiet when both sides hold the identical document', () => {
    expect(classifyProjectDrift({ localSig: sig('a'), devSig: sig('a') })).toEqual({ kind: 'same' })
  })

  it('flags dev-ahead when only the dev tier moved off the shared baseline', () => {
    const result = classifyProjectDrift({ localSig: sig('a', 'base'), devSig: sig('b', 'new'), baselineShape: 'base' })
    expect(result).toEqual({ kind: 'dev-ahead' })
  })

  it('flags local-ahead when only this box moved off the shared baseline', () => {
    const result = classifyProjectDrift({ localSig: sig('a', 'new'), devSig: sig('b', 'base'), baselineShape: 'base' })
    expect(result).toEqual({ kind: 'local-ahead' })
  })

  it('flags both-moved when neither side matches the baseline any more', () => {
    const result = classifyProjectDrift({ localSig: sig('a', 'new-a'), devSig: sig('b', 'new-b'), baselineShape: 'base' })
    expect(result).toEqual({ kind: 'both-moved' })
  })

  it('cannot say who moved without a baseline', () => {
    const result = classifyProjectDrift({ localSig: sig('a'), devSig: sig('b') })
    expect(result).toEqual({ kind: 'differs-no-baseline' })
  })

  it('reports a project only this box holds', () => {
    expect(classifyProjectDrift({ localSig: sig('a'), devSig: undefined })).toEqual({ kind: 'local-only' })
  })

  it('reports a project only the dev tier holds', () => {
    expect(classifyProjectDrift({ localSig: undefined, devSig: sig('a') })).toEqual({ kind: 'dev-only' })
  })
})

describe('checkCode', () => {
  beforeEach(() => {
    childProcess.execFileSync.mockReset()
    getState.mockReset()
  })

  const runWith = ({ remotes = '', fetchOk = true, state }) => {
    childProcess.execFileSync.mockImplementation((_bin, args) => {
      if (args[0] === 'remote') return remotes
      if (args[0] === 'fetch') { if (!fetchOk) throw Object.assign(new Error('fail'), { signal: 'SIGTERM' }); return '' }
      if (args[0] === 'rev-list') return '0'
      return ''
    })
    getState.mockReturnValue(state)
    return checkCode()
  }

  it('reports up-to-date when the current branch matches origin/dev', () => {
    const result = runWith({
      state: { currentBranch: 'dev', currentPath: '/repo', headBehindDev: null, currentBranchBehindDev: null, currentUpstreamGone: false, worktrees: [{ path: '/repo', dirty: false }] }
    })
    expect(result.notLatest).toBe(false)
    expect(result.behindOriginDev).toBeNull()
  })

  it('reports NOT LATEST when the current branch trails origin/dev', () => {
    const result = runWith({
      state: { currentBranch: 'feat/x', currentPath: '/repo', currentBranchBehindDev: 12, currentUpstreamGone: false, worktrees: [{ path: '/repo', dirty: false }] }
    })
    expect(result.notLatest).toBe(true)
    expect(result.behindOriginDev).toBe(12)
  })

  it('reports a fork whose dev trails upstream/dev', () => {
    childProcess.execFileSync.mockImplementation((_bin, args) => {
      if (args[0] === 'remote') return 'origin\nupstream'
      if (args[0] === 'fetch') return ''
      if (args[0] === 'rev-list') return args[2].includes('origin/dev..upstream/dev') ? '7' : '0'
      return ''
    })
    getState.mockReturnValue({ currentBranch: 'dev', currentPath: '/repo', headBehindDev: null, currentUpstreamGone: false, worktrees: [{ path: '/repo', dirty: false }] })
    const result = checkCode()
    expect(result.isFork).toBe(true)
    expect(result.forkDevBehindUpstream).toBe(7)
    expect(result.notLatest).toBe(true)
  })

  it('never reports false confidence when the fetch itself fails — surfaces the failure instead', () => {
    const result = runWith({
      fetchOk: false,
      state: { currentBranch: 'dev', currentPath: '/repo', headBehindDev: null, currentUpstreamGone: false, worktrees: [{ path: '/repo', dirty: false }] }
    })
    expect(result.fetchedOrigin).toBe(false)
    expect(result.fetchOriginError).toBe('timed out')
  })

  it('notes uncommitted work without treating it as NOT LATEST on its own', () => {
    const result = runWith({
      state: { currentBranch: 'dev', currentPath: '/repo', headBehindDev: null, currentUpstreamGone: false, worktrees: [{ path: '/repo', dirty: true }] }
    })
    expect(result.dirty).toBe(true)
    expect(result.notLatest).toBe(false)
  })
})

describe('checkSpaces', () => {
  beforeEach(() => {
    listSpaces.mockReset()
    readSignatures.mockReset()
    readBaseline.mockReset().mockReturnValue({})
    process.env.API_TOKEN = 'local-token'
    process.env.LIVE_API_TOKEN = 'dev-token'
  })

  it('is not-checked when neither tier has a token configured', async () => {
    delete process.env.API_TOKEN
    delete process.env.LIVE_API_TOKEN
    const result = await checkSpaces({ spaceFilter: null })
    expect(result.status).toBe('not-checked')
  })

  it('is ok when this box holds no spaces', async () => {
    listSpaces.mockResolvedValue([])
    const result = await checkSpaces({ spaceFilter: null })
    expect(result.status).toBe('ok')
  })

  it('flags dev-ahead when the dev tier has newer work than the recorded baseline', async () => {
    listSpaces.mockResolvedValue(['wcc'])
    readBaseline.mockReturnValue({ staging: { 'wcc/home': 'base-shape' } })
    readSignatures.mockImplementation(async (tier) => {
      if (tier.base.includes('staging')) return { wcc: { home: sig('dev-hash', 'dev-shape') } }
      return { wcc: { home: sig('local-hash', 'base-shape') } }
    })
    const result = await checkSpaces({ spaceFilter: 'wcc' })
    expect(result.notLatest).toBe(true)
    expect(result.projects).toEqual([{ spaceId: 'wcc', projectId: 'home', kind: 'dev-ahead' }])
  })

  it('reports not-checked when the dev tier is unreachable, never as "no drift"', async () => {
    listSpaces.mockResolvedValue(['wcc'])
    readSignatures.mockImplementation(async (tier) => {
      if (tier.base.includes('staging')) throw new Error('fetch failed')
      return { wcc: { home: sig('a') } }
    })
    const result = await checkSpaces({ spaceFilter: 'wcc' })
    expect(result.notLatest).toBe(false)
    expect(result.projects[0]).toMatchObject({ spaceId: 'wcc', kind: 'not-checked' })
    expect(result.projects[0].reason).toContain('unreachable')
  })

  it('reports not-checked (not drift) when the local tier itself cannot be listed', async () => {
    listSpaces.mockRejectedValue(new Error('ECONNREFUSED'))
    const result = await checkSpaces({ spaceFilter: null })
    expect(result.status).toBe('not-checked')
    expect(result.reason).toContain('unreachable')
  })
})

describe('formatReport', () => {
  const okCode = { fetchedOrigin: true, isFork: false, currentBranch: 'dev', behindOriginDev: null, currentUpstreamGone: false, dirty: false, notLatest: false }
  const okSpaces = { status: 'ok', reason: 'this box holds no spaces yet', projects: [], notLatest: false }

  it('headlines LATEST when nothing is behind', () => {
    const report = formatReport({ code: okCode, spaces: okSpaces, strict: false })
    expect(report).toContain('LATEST')
    expect(report).not.toContain('NOT LATEST')
  })

  it('headlines NOT LATEST and names the pull command when code trails origin/dev', () => {
    const report = formatReport({
      code: { ...okCode, currentBranch: 'feat/x', behindOriginDev: 5, notLatest: true },
      spaces: okSpaces,
      strict: false
    })
    expect(report).toContain('NOT LATEST')
    expect(report).toContain('5 commits behind origin/dev')
  })

  it('surfaces a space the dev tier is ahead on, with the pull command', () => {
    const spaces = { status: 'checked', notLatest: true, projects: [{ spaceId: 'wcc', projectId: 'home', kind: 'dev-ahead' }] }
    const report = formatReport({ code: okCode, spaces, strict: false })
    expect(report).toContain('NOT LATEST')
    expect(report).toContain('wcc/home')
    expect(report).toContain('project-pull.mjs home --space wcc')
  })

  it('names the --strict exit only when both strict and NOT LATEST', () => {
    const notLatestReport = formatReport({ code: { ...okCode, notLatest: true, behindOriginDev: 1 }, spaces: okSpaces, strict: true })
    expect(notLatestReport).toContain('--strict: exiting 1')
    const latestReport = formatReport({ code: okCode, spaces: okSpaces, strict: true })
    expect(latestReport).not.toContain('exiting 1')
  })
})
