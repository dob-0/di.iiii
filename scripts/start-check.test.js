import { describe, expect, it, vi, beforeEach } from 'vitest'

// start-check.mjs imports getState from repo-state.mjs and listSpaces/
// listProjectMetas/readBaseline/documentSignature/call/TIERS/localBase from
// tier-sync.mjs. Mocking both lets these tests drive checkCode()/
// checkSpaces() through every shape the plan asks for (up-to-date, behind,
// fork-behind, space-newer-on-dev, tier-unreachable, local-base-fallback,
// drift-that-predates-any-run) without a real git remote or a real server —
// this repo has no permission to write to any live tier, and start-check
// itself must stay read-only, so a mock is the only honest way to exercise
// "dev has newer work" here.
vi.mock('./repo-state.mjs', () => ({ getState: vi.fn() }))
vi.mock('./tier-sync.mjs', () => ({
  TIERS: { local: { base: 'http://localhost:4000/serverXR', tokenKey: 'API_TOKEN' }, staging: { base: 'https://dev.diiii.xyz/serverXR', tokenKey: 'LIVE_API_TOKEN' } },
  localBase: (env) => env?.LOCAL_API_URL ? `${env.LOCAL_API_URL.replace(/\/+$/, '')}/serverXR` : 'http://localhost:4000/serverXR',
  listSpaces: vi.fn(),
  listProjectMetas: vi.fn(),
  readBaseline: vi.fn(() => ({})),
  documentSignature: vi.fn((doc) => ({ shape: doc?.shape })),
  call: vi.fn()
}))

const childProcess = vi.hoisted(() => ({ execFileSync: vi.fn() }))
vi.mock('node:child_process', () => ({
  execFileSync: childProcess.execFileSync,
  default: { execFileSync: childProcess.execFileSync }
}))

import { getState } from './repo-state.mjs'
import { listSpaces, listProjectMetas, readBaseline, call } from './tier-sync.mjs'
import { checkCode, checkSpaces, classifyProjectDrift, formatReport } from './start-check.mjs'

const meta = (documentVersion, updatedAt = 1) => ({ documentVersion, updatedAt })

describe('classifyProjectDrift', () => {
  it('is quiet when both sides report the exact same version and timestamp', () => {
    expect(classifyProjectDrift({ local: meta(3, 100), dev: meta(3, 100) })).toEqual({ kind: 'same' })
  })

  it('is quiet when a live content fetch confirms identical shapes', () => {
    const result = classifyProjectDrift({ local: meta(3, 100), dev: meta(4, 200), localShape: 'x', devShape: 'x' })
    expect(result).toEqual({ kind: 'same' })
  })

  // The exact bug this exists to prevent: a project that was ALREADY
  // drifted is not "same" just because nothing has moved SINCE some
  // arbitrary reference point — there is no reference point here at all,
  // only the two tiers' live state and a real baseline.
  it('confirms dev-ahead from the baseline when the dev-side shape moved off it', () => {
    const result = classifyProjectDrift({ local: meta(3, 100), dev: meta(4, 200), baselineShape: 'base', localShape: 'base', devShape: 'new' })
    expect(result).toEqual({ kind: 'dev-ahead', confirmed: true })
  })

  it('confirms local-ahead from the baseline when only the local shape moved', () => {
    const result = classifyProjectDrift({ local: meta(4, 200), dev: meta(3, 100), baselineShape: 'base', localShape: 'new', devShape: 'base' })
    expect(result).toEqual({ kind: 'local-ahead', confirmed: true })
  })

  it('confirms both-moved when neither shape matches the baseline any more', () => {
    const result = classifyProjectDrift({ local: meta(5, 300), dev: meta(9, 400), baselineShape: 'base', localShape: 'a', devShape: 'b' })
    expect(result).toEqual({ kind: 'both-moved', confirmed: true })
  })

  it('falls back to the updatedAt heuristic when there is no baseline to confirm against', () => {
    const result = classifyProjectDrift({ local: meta(3, 100), dev: meta(4, 500) })
    expect(result).toEqual({ kind: 'dev-ahead', confirmed: false })
  })

  it('falls back to the updatedAt heuristic the other direction', () => {
    const result = classifyProjectDrift({ local: meta(4, 500), dev: meta(3, 100) })
    expect(result).toEqual({ kind: 'local-ahead', confirmed: false })
  })

  it('is honestly undetermined when timestamps tie and there is no baseline', () => {
    const result = classifyProjectDrift({ local: meta(3, 100), dev: meta(4, 100) })
    expect(result).toEqual({ kind: 'differs-undetermined' })
  })

  it('a project missing on dev, in a space both tiers hold, is definitively local-ahead', () => {
    expect(classifyProjectDrift({ local: meta(1), dev: undefined })).toEqual({ kind: 'local-ahead', confirmed: true })
  })

  it('a project missing locally, in a space both tiers hold, is definitively dev-ahead', () => {
    expect(classifyProjectDrift({ local: undefined, dev: meta(1) })).toEqual({ kind: 'dev-ahead', confirmed: true })
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

const okDoc = (shape) => ({ ok: true, json: async () => ({ document: { shape } }) })

describe('checkSpaces', () => {
  beforeEach(() => {
    listSpaces.mockReset()
    listProjectMetas.mockReset()
    readBaseline.mockReset().mockReturnValue({})
    call.mockReset()
    process.env.API_TOKEN = 'local-token'
    process.env.LIVE_API_TOKEN = 'dev-token'
    delete process.env.LOCAL_API_URL
  })

  it('is not-checked when neither tier has a token configured', async () => {
    delete process.env.API_TOKEN
    delete process.env.LIVE_API_TOKEN
    const result = await checkSpaces({ spaceFilter: null })
    expect(result.status).toBe('not-checked')
  })

  it('is ok when neither tier holds any spaces', async () => {
    listSpaces.mockResolvedValue([])
    const result = await checkSpaces({ spaceFilter: null })
    expect(result.status).toBe('ok')
  })

  // The bug this whole rework exists to fix: a project ALREADY drifted
  // before this ever ran must still be caught on the very first run —
  // nothing here is allowed to treat "first time seeing it" as "fine".
  it('flags dev-ahead on the very first run — no cache to have missed it', async () => {
    listSpaces.mockImplementation(async (tier) => tier.base.includes('dev.diiii') ? ['br-id-ge'] : ['br-id-ge'])
    listProjectMetas.mockImplementation(async (tier) =>
      tier.base.includes('dev.diiii') ? [{ id: 'landing', documentVersion: 96, updatedAt: 2000 }] : [{ id: 'landing', documentVersion: 40, updatedAt: 1000 }])
    const result = await checkSpaces({ spaceFilter: 'br-id-ge' })
    expect(result.notLatest).toBe(true)
    expect(result.projects).toEqual([{ spaceId: 'br-id-ge', projectId: 'landing', kind: 'dev-ahead', confirmed: false }])
  })

  it('confirms the direction with a live document fetch when a baseline exists', async () => {
    listSpaces.mockResolvedValue(['wcc'])
    listProjectMetas.mockImplementation(async (tier) =>
      tier.base.includes('dev.diiii') ? [{ id: 'home', documentVersion: 4, updatedAt: 200 }] : [{ id: 'home', documentVersion: 3, updatedAt: 100 }])
    readBaseline.mockReturnValue({ staging: { 'wcc/home': 'base' } })
    call.mockImplementation(async (tier) => tier.base.includes('dev.diiii') ? okDoc('new') : okDoc('base'))
    const result = await checkSpaces({ spaceFilter: 'wcc' })
    expect(result.notLatest).toBe(true)
    expect(result.projects).toEqual([{ spaceId: 'wcc', projectId: 'home', kind: 'dev-ahead', confirmed: true }])
  })

  it('never puts the same space in two buckets — a shared space with one project each way', async () => {
    listSpaces.mockResolvedValue(['main'])
    listProjectMetas.mockImplementation(async (tier) => tier.base.includes('dev.diiii')
      ? [{ id: 'only-on-dev', documentVersion: 1, updatedAt: 1 }]
      : [{ id: 'only-locally', documentVersion: 1, updatedAt: 1 }])
    const result = await checkSpaces({ spaceFilter: 'main' })
    const kinds = result.projects.map((r) => r.kind).sort()
    expect(kinds).toEqual(['dev-ahead', 'local-ahead'])
  })

  it('reports a space that exists only on one tier as one line, not drift', async () => {
    listSpaces.mockImplementation(async (tier) => tier.base.includes('dev.diiii') ? [] : ['local-only-space'])
    const result = await checkSpaces({ spaceFilter: null })
    expect(result.notLatest).toBe(false)
    expect(result.projects).toEqual([{ spaceId: 'local-only-space', kind: 'space-local-only' }])
  })

  it('reports not-checked (not drift) when the dev tier cannot be listed at all', async () => {
    listSpaces.mockImplementation(async (tier) => { if (tier.base.includes('dev.diiii')) throw new Error('fetch failed'); return ['wcc'] })
    const result = await checkSpaces({ spaceFilter: null })
    expect(result.status).toBe('not-checked')
  })

  it('falls back to localhost:4000 when the configured local tier is unreachable', async () => {
    process.env.LOCAL_API_URL = 'https://local.thedi.studio'
    let calls = 0
    listSpaces.mockImplementation(async (tier) => {
      if (tier.base.includes('dev.diiii')) return []
      calls++
      if (tier.base.includes('local.thedi.studio')) throw new Error('fetch failed')
      expect(tier.base).toBe('http://localhost:4000/serverXR')
      return []
    })
    const result = await checkSpaces({ spaceFilter: null })
    expect(calls).toBe(2)
    expect(result.status).toBe('ok')
  })

  it('never claims false safety when both the configured tier and the fallback fail', async () => {
    process.env.LOCAL_API_URL = 'https://local.thedi.studio'
    listSpaces.mockImplementation(async (tier) => { if (tier.base.includes('dev.diiii')) return []; throw new Error('fetch failed') })
    const result = await checkSpaces({ spaceFilter: null })
    expect(result.status).toBe('not-checked')
    expect(result.reason).toContain('local.thedi.studio')
    expect(result.reason).toContain('localhost:4000')
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

  it('summarizes spaces in one line, each space in exactly one bucket, with the exact pull command', () => {
    const spaces = {
      status: 'checked', notLatest: true, totalSpaces: 3,
      projects: [
        { spaceId: 'wcc', projectId: 'home', kind: 'dev-ahead', confirmed: true },
        { spaceId: 'main', projectId: 'landing', kind: 'both-moved', confirmed: true }
      ]
    }
    const report = formatReport({ code: okCode, spaces, strict: false })
    expect(report).toContain('spaces: 1 same · 1 newer on dev: wcc · 1 changed on both: main')
    expect(report).toContain('wcc/home')
    expect(report).toContain('project-pull.mjs home --space wcc')
    expect(report).toContain('main/landing')
  })

  it('never lists the same space under two buckets in the summary', () => {
    const spaces = {
      status: 'checked', notLatest: true, totalSpaces: 1,
      projects: [
        { spaceId: 'main', projectId: 'a', kind: 'dev-ahead', confirmed: true },
        { spaceId: 'main', projectId: 'b', kind: 'local-ahead', confirmed: true }
      ]
    }
    const report = formatReport({ code: okCode, spaces, strict: false })
    expect(report).toContain('1 newer on dev: main')
    expect(report).not.toContain('local ahead: main')
  })

  it('gives a space that exists on only one tier its own short line, not "drift"', () => {
    const spaces = { status: 'checked', notLatest: false, totalSpaces: 2, projects: [{ spaceId: 'sandbox', kind: 'space-local-only' }] }
    const report = formatReport({ code: okCode, spaces, strict: false })
    expect(report).toContain('1 local-only: sandbox')
    expect(report).toContain('only on this box')
  })

  it('caps detail lines and points at --spaces-detail for the rest', () => {
    const projects = Array.from({ length: 8 }, (_, i) => ({ spaceId: `s${i}`, projectId: 'p', kind: 'dev-ahead', confirmed: true }))
    const spaces = { status: 'checked', notLatest: true, totalSpaces: 8, projects }
    const capped = formatReport({ code: okCode, spaces, strict: false })
    expect(capped.match(/project-pull\.mjs/g)).toHaveLength(5)
    expect(capped).toContain('+3 more — npm run start-check -- --spaces-detail')

    const full = formatReport({ code: okCode, spaces, strict: false, spacesDetail: true })
    expect(full.match(/project-pull\.mjs/g)).toHaveLength(8)
    expect(full).not.toContain('more —')
  })

  it('names the --strict exit only when both strict and NOT LATEST', () => {
    const notLatestReport = formatReport({ code: { ...okCode, notLatest: true, behindOriginDev: 1 }, spaces: okSpaces, strict: true })
    expect(notLatestReport).toContain('--strict: exiting 1')
    const latestReport = formatReport({ code: okCode, spaces: okSpaces, strict: true })
    expect(latestReport).not.toContain('exiting 1')
  })
})
