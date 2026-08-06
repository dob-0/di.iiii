import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { checkSafeSource, parseEngineVersion, writeSelfCheckAndWorkflow } from './space-sync-vendor.mjs'

// checkSafeSource exists because 8 runnable copies of this script existed on one
// machine at once (2026-08-06), 2 of them next to a stale v4 engine — running
// --write from either would have silently downgraded every linked repo and
// reported success. See the header comment in space-sync-vendor.mjs.

const safeFacts = () => ({
  isLinkedWorktree: false,
  headBranch: 'dev',
  devIsAncestorOfHead: true,
  upstreamDirty: false,
  upstreamVersion: 6,
  targetVersions: { br_id_ge: 5, beyond_form: 5 },
  allowDowngrade: false
})

describe('checkSafeSource', () => {
  it('allows a clean vendor from dev with the engine committed and no downgrade', () => {
    expect(checkSafeSource(safeFacts())).toEqual([])
  })

  it('refuses when running from a linked worktree', () => {
    const reasons = checkSafeSource({ ...safeFacts(), isLinkedWorktree: true })
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toMatch(/linked git worktree/)
  })

  it('refuses when not on dev or main', () => {
    const reasons = checkSafeSource({ ...safeFacts(), headBranch: 'feat/whatever', devIsAncestorOfHead: null })
    expect(reasons[0]).toMatch(/branch "feat\/whatever"/)
  })

  it('refuses on a detached HEAD, naming it explicitly', () => {
    const reasons = checkSafeSource({ ...safeFacts(), headBranch: null, devIsAncestorOfHead: null })
    expect(reasons[0]).toMatch(/detached HEAD/)
  })

  it('refuses when the checkout is behind origin/dev', () => {
    const reasons = checkSafeSource({ ...safeFacts(), devIsAncestorOfHead: false })
    expect(reasons[0]).toMatch(/behind origin\/dev/)
  })

  it('refuses when the upstream engine itself has uncommitted changes', () => {
    const reasons = checkSafeSource({ ...safeFacts(), upstreamDirty: true })
    expect(reasons[0]).toMatch(/uncommitted changes/)
    // this is exactly the case that stalled the real v5→v6 upgrade for 15+ hours
  })

  it('refuses a downgrade — a target ahead of upstream', () => {
    const reasons = checkSafeSource({ ...safeFacts(), upstreamVersion: 4, targetVersions: { br_id_ge: 6 } })
    expect(reasons[0]).toMatch(/br_id_ge's vendored engine is v6, upstream is only v4/)
  })

  it('allows a downgrade when --allow-downgrade is set', () => {
    const reasons = checkSafeSource({
      ...safeFacts(),
      upstreamVersion: 4,
      targetVersions: { br_id_ge: 6 },
      allowDowngrade: true
    })
    expect(reasons).toEqual([])
  })

  it('collects every applicable reason, not just the first', () => {
    const reasons = checkSafeSource({
      isLinkedWorktree: true,
      headBranch: 'some-other-branch',
      devIsAncestorOfHead: null,
      upstreamDirty: true,
      upstreamVersion: 4,
      targetVersions: { br_id_ge: 6 },
      allowDowngrade: false
    })
    expect(reasons).toHaveLength(4)
  })
})

describe('parseEngineVersion', () => {
  it('reads the version out of a real-shaped source file', () => {
    expect(parseEngineVersion('foo\nexport const ENGINE_VERSION = 6\nbar')).toBe(6)
  })

  it('returns null when there is no version marker (pre-versioning copies)', () => {
    expect(parseEngineVersion('// no version here at all')).toBeNull()
  })
})

// A real dry-run bug lived here briefly: the first version called this function
// unconditionally before checking the dryRun flag, so `--release --dry-run` was
// silently writing files to disk despite promising to touch nothing. Caught by
// actually running it, not by inspection — these tests pin the fix down.
describe('writeSelfCheckAndWorkflow', () => {
  let dir

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vendor-selfcheck-test-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('dry-run mode reports what would change but writes nothing to disk', () => {
    const changed = writeSelfCheckAndWorkflow(dir, true)
    expect(changed.length).toBeGreaterThan(0)
    for (const relPath of changed) {
      expect(fs.existsSync(path.join(dir, relPath))).toBe(false)
    }
  })

  it('a real run writes every reported file', () => {
    const changed = writeSelfCheckAndWorkflow(dir, false)
    expect(changed.length).toBeGreaterThan(0)
    for (const relPath of changed) {
      expect(fs.existsSync(path.join(dir, relPath))).toBe(true)
    }
  })

  it('is idempotent — a second real run against identical content reports nothing changed', () => {
    writeSelfCheckAndWorkflow(dir, false)
    expect(writeSelfCheckAndWorkflow(dir, false)).toEqual([])
  })
})
