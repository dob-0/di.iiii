import { describe, expect, it } from 'vitest'

import { ownsCurrentMdFreshness } from './repo-state-lib.mjs'

// 2026-10-16 (N885): dev's CURRENT.md recap fell 3 days behind its code, and the freshness check ran on
// every branch — but a feature branch must keep dev's CURRENT.md unchanged, so no feature branch could pass.
// Only the writers of CURRENT.md (dev and fold branches) are held to freshness.
describe('ownsCurrentMdFreshness', () => {
  it.each(['dev', 'chore/fold-notes-after-1025-2026-10-20', 'land/batch-2026-10-20', null, undefined, ''])(
    'checks freshness on %s', (name) => expect(ownsCurrentMdFreshness(name)).toBe(true)
  )

  it.each(['main', 'feat/x', 'fix/docs-gate-freshness-2026-10-20', 'feat/rigbuild-test-tools'])(
    'skips freshness on %s (it may not write CURRENT.md)', (name) => expect(ownsCurrentMdFreshness(name)).toBe(false)
  )
})
