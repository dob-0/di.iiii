import { describe, expect, it } from 'vitest'

import { isFoldBranch } from './repo-state-lib.mjs'

// 2026-09-30: the pre-push docs gate refused the hand fold of CURRENT.md
// (chore/fold-notes-after-670) because check-agent-docs.mjs treats every write to
// CURRENT.md as a feature-branch race. CI's land job cannot push to protected dev, so a
// fold branch is the one legitimate writer.
describe('isFoldBranch', () => {
  it.each(['chore/fold-notes-after-670', 'chore/fold-notes-', 'land/batch-2026-09-30'])(
    'exempts %s', (name) => expect(isFoldBranch(name)).toBe(true)
  )

  it.each(['dev', 'main', 'feat/x', 'fix/docs-gate-fold-branches', 'chore/fold-notes', 'chore/other', 'landing/x', 'xland/y', '', null, undefined])(
    'does not exempt %s (detached HEAD is null/empty)', (name) => expect(isFoldBranch(name)).toBe(false)
  )
})
