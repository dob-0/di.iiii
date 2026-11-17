// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { lastCommitFor, stampParts } from './partStamps.mjs'

const HASH = 'a'.repeat(40)
const ran = (status, stdout = '') => () => ({ status, stdout })

describe('part stamps from git, at pack time', () => {
  it('reads the last commit and its date for the part dirs', () => {
    const calls = []
    const run = (cmd, args) => { calls.push([cmd, ...args]); return { status: 0, stdout: `${HASH}\t2026-11-12\n` } }
    expect(lastCommitFor(['serverXR/src/lighting', 'x'], { cwd: '/r', run })).toEqual({ commit: HASH, date: '2026-11-12' })
    expect(calls[0]).toEqual(['git', 'log', '-1', '--format=%H%x09%cs', '--', 'serverXR/src/lighting', 'x'])
  })

  it('says null, never a guess, with no git or no history or odd output', () => {
    const none = { commit: null, date: null }
    expect(lastCommitFor(['a'], { run: ran(128) })).toEqual(none)
    expect(lastCommitFor(['a'], { run: ran(0, '') })).toEqual(none)
    expect(lastCommitFor(['a'], { run: ran(0, 'not-a-hash\tyesterday') })).toEqual(none)
    expect(lastCommitFor(['a'], { run: () => null })).toEqual(none)
  })

  it('stamps every part, same order, by id', () => {
    const run = ran(0, `${HASH}\t2026-11-01`)
    const out = stampParts([{ id: 'light', dirs: ['a'] }, { id: 'osc', dirs: ['b'] }], { run })
    expect(out.map((p) => p.id)).toEqual(['light', 'osc'])
    expect(out[1]).toEqual({ id: 'osc', commit: HASH, date: '2026-11-01' })
  })
})
