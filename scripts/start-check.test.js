import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// start-check.mjs imports getState from repo-state.mjs and listSpaces/
// listProjectMetas/TIERS/localBase from tier-sync.mjs. Mocking both lets
// these tests drive checkCode()/checkSpaces() through every shape the plan
// asks for (up-to-date, behind, fork-behind, space-newer-on-dev,
// tier-unreachable, local-base-fallback) without a real git remote or a real
// server — this repo has no permission to write to any live tier, and
// start-check itself must stay read-only, so a mock is the only honest way
// to exercise "dev has newer work" here.
vi.mock('./repo-state.mjs', () => ({ getState: vi.fn() }))
vi.mock('./tier-sync.mjs', () => ({
  TIERS: { local: { base: 'http://localhost:4000/serverXR', tokenKey: 'API_TOKEN' }, staging: { base: 'https://dev.diiii.xyz/serverXR', tokenKey: 'LIVE_API_TOKEN' } },
  localBase: (env) => env?.LOCAL_API_URL ? `${env.LOCAL_API_URL.replace(/\/+$/, '')}/serverXR` : 'http://localhost:4000/serverXR',
  listSpaces: vi.fn(),
  listProjectMetas: vi.fn()
}))

const childProcess = vi.hoisted(() => ({ execFileSync: vi.fn() }))
vi.mock('node:child_process', () => ({
  execFileSync: childProcess.execFileSync,
  default: { execFileSync: childProcess.execFileSync }
}))

import { getState } from './repo-state.mjs'
import { listSpaces, listProjectMetas } from './tier-sync.mjs'
import { checkCode, checkSpaces, classifyVersionDrift, formatReport } from './start-check.mjs'

const meta = (documentVersion, updatedAt = 1) => ({ documentVersion, updatedAt })

describe('classifyVersionDrift', () => {
  it('is quiet when neither side moved off the cached versions', () => {
    const result = classifyVersionDrift({ local: meta(3), dev: meta(3), cached: { localVersion: 3, devVersion: 3 } })
    expect(result).toEqual({ kind: 'same' })
  })

  it('flags dev-ahead when only the dev tier moved off the cache', () => {
    const result = classifyVersionDrift({ local: meta(3), dev: meta(4), cached: { localVersion: 3, devVersion: 3 } })
    expect(result).toEqual({ kind: 'dev-ahead' })
  })

  it('flags local-ahead when only this box moved off the cache', () => {
    const result = classifyVersionDrift({ local: meta(4), dev: meta(3), cached: { localVersion: 3, devVersion: 3 } })
    expect(result).toEqual({ kind: 'local-ahead' })
  })

  it('flags both-moved when both sides moved off the cache', () => {
    const result = classifyVersionDrift({ local: meta(5), dev: meta(9), cached: { localVersion: 3, devVersion: 3 } })
    expect(result).toEqual({ kind: 'both-moved' })
  })

  it('is "new" — cannot say who moved — the first time a project is seen', () => {
    const result = classifyVersionDrift({ local: meta(3), dev: meta(3), cached: undefined })
    expect(result).toEqual({ kind: 'new' })
  })

  it('reports a project only this box holds', () => {
    expect(classifyVersionDrift({ local: meta(1), dev: undefined, cached: undefined })).toEqual({ kind: 'local-only' })
  })

  it('reports a project only the dev tier holds', () => {
    expect(classifyVersionDrift({ local: undefined, dev: meta(1), cached: undefined })).toEqual({ kind: 'dev-only' })
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
  let dataRoot

  beforeEach(() => {
    listSpaces.mockReset()
    listProjectMetas.mockReset()
    process.env.API_TOKEN = 'local-token'
    process.env.LIVE_API_TOKEN = 'dev-token'
    delete process.env.LOCAL_API_URL
    // An isolated cache location per test — checkSpaces persists what it saw
    // to serverXR/data/start-check-cache.json (path.resolve treats an
    // absolute DATA_ROOT as the whole path), so this never touches the
    // repo's real cache or any other test's.
    dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'start-check-cache-'))
    process.env.DATA_ROOT = dataRoot
  })

  afterEach(() => {
    delete process.env.DATA_ROOT
    fs.rmSync(dataRoot, { recursive: true, force: true })
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

  it('seeds the cache blind the first time a project is seen — reports "new", not a false match', async () => {
    listSpaces.mockResolvedValue(['wcc'])
    listProjectMetas.mockImplementation(async (tier) => [{ id: 'home', documentVersion: tier.base.includes('dev.diiii') ? 3 : 3, updatedAt: 1 }])
    const result = await checkSpaces({ spaceFilter: 'wcc' })
    expect(result.notLatest).toBe(false)
    expect(result.projects).toEqual([{ spaceId: 'wcc', projectId: 'home', kind: 'new' }])
  })

  it('flags dev-ahead on the second run once the dev tier moves past what was cached', async () => {
    listSpaces.mockResolvedValue(['wcc'])
    listProjectMetas.mockImplementation(async (tier) => [{ id: 'home', documentVersion: tier.base.includes('dev.diiii') ? 3 : 3, updatedAt: 1 }])
    await checkSpaces({ spaceFilter: 'wcc' }) // first run: seeds the cache at v3/v3

    listProjectMetas.mockImplementation(async (tier) => [{ id: 'home', documentVersion: tier.base.includes('dev.diiii') ? 4 : 3, updatedAt: 2 }])
    const result = await checkSpaces({ spaceFilter: 'wcc' })
    expect(result.notLatest).toBe(true)
    expect(result.projects).toEqual([{ spaceId: 'wcc', projectId: 'home', kind: 'dev-ahead' }])
  })

  it('reports not-checked (not drift) when the dev tier is unreachable', async () => {
    listSpaces.mockResolvedValue(['wcc'])
    listProjectMetas.mockImplementation(async (tier) => {
      if (tier.base.includes('dev.diiii')) throw new Error('fetch failed')
      return [{ id: 'home', documentVersion: 1, updatedAt: 1 }]
    })
    const result = await checkSpaces({ spaceFilter: 'wcc' })
    expect(result.notLatest).toBe(false)
    expect(result.projects[0]).toMatchObject({ spaceId: 'wcc', kind: 'not-checked' })
  })

  it('reports not-checked (not drift) when the local tier itself cannot be listed at all', async () => {
    listSpaces.mockRejectedValue(Object.assign(new Error('fetch failed'), { message: 'fetch failed' }))
    const result = await checkSpaces({ spaceFilter: null })
    expect(result.status).toBe('not-checked')
    expect(result.reason).toContain('unreachable')
  })

  // The real bug this exists for: LOCAL_API_URL=https://local.thedi.studio
  // resolves fine, but a box where that install isn't running right now
  // should not just give up — try localhost:4000 before reporting "not
  // checked", and only fall back on an actual network failure (not e.g. 401).
  it('falls back to localhost:4000 when the configured local tier is unreachable', async () => {
    process.env.LOCAL_API_URL = 'https://local.thedi.studio'
    let calls = 0
    listSpaces.mockImplementation(async (tier) => {
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
    listSpaces.mockRejectedValue(new Error('fetch failed'))
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

  it('summarizes spaces in one line and details the drifted ones, with the exact pull command', () => {
    const spaces = {
      status: 'checked', notLatest: true, totalSpaces: 3,
      projects: [
        { spaceId: 'wcc', projectId: 'home', kind: 'dev-ahead' },
        { spaceId: 'main', projectId: 'landing', kind: 'both-moved' }
      ]
    }
    const report = formatReport({ code: okCode, spaces, strict: false })
    expect(report).toContain('spaces: 1 same · 1 newer on dev: wcc · 1 changed on both: main')
    expect(report).toContain('wcc/home')
    expect(report).toContain('project-pull.mjs home --space wcc')
    expect(report).toContain('main/landing')
  })

  it('caps detail lines and points at --spaces-detail for the rest', () => {
    const projects = Array.from({ length: 8 }, (_, i) => ({ spaceId: `s${i}`, projectId: 'p', kind: 'dev-ahead' }))
    const spaces = { status: 'checked', notLatest: true, totalSpaces: 8, projects }
    const capped = formatReport({ code: okCode, spaces, strict: false })
    expect(capped.match(/project-pull\.mjs/g)).toHaveLength(5)
    expect(capped).toContain('+3 more — npm run start-check -- --spaces-detail')

    const full = formatReport({ code: okCode, spaces, strict: false, spacesDetail: true })
    expect(full.match(/project-pull\.mjs/g)).toHaveLength(8)
    expect(full).not.toContain('more —')
  })

  it('collapses not-checked spaces into one line, grouped by reason', () => {
    const spaces = {
      status: 'checked', notLatest: false, totalSpaces: 3,
      projects: [
        { spaceId: 'a', kind: 'not-checked', reason: 'dev tier or local unreachable: fetch failed' },
        { spaceId: 'b', kind: 'not-checked', reason: 'dev tier or local unreachable: fetch failed' }
      ]
    }
    const report = formatReport({ code: okCode, spaces, strict: false })
    expect(report).toContain('2 not checked (2× dev tier or local unreachable: fetch failed)')
  })

  it('names the --strict exit only when both strict and NOT LATEST', () => {
    const notLatestReport = formatReport({ code: { ...okCode, notLatest: true, behindOriginDev: 1 }, spaces: okSpaces, strict: true })
    expect(notLatestReport).toContain('--strict: exiting 1')
    const latestReport = formatReport({ code: okCode, spaces: okSpaces, strict: true })
    expect(latestReport).not.toContain('exiting 1')
  })
})
