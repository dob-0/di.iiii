// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { historyFor, lastCommitFor, stampParts } from './partStamps.mjs'

const HASH = 'a'.repeat(40)
const ran = (status, stdout = '') => () => ({ status, stdout })

describe('part stamps from git, at pack time', () => {
  it('reads the last commit and its date for the part dirs', () => {
    const calls = []
    const run = (cmd, args) => { calls.push([cmd, ...args]); return { status: 0, stdout: `${HASH}\t2026-11-12\n` } }
    expect(lastCommitFor(['serverXR/src/lighting', 'x'], { cwd: '/r', run })).toEqual({ commit: HASH, date: '2026-11-12' })
    expect(calls.find((c) => c[1] === 'log')).toEqual(['git', 'log', '-1', '--format=%H%x09%cs', '--', 'serverXR/src/lighting', 'x'])
  })

  it('a shallow clone gives null, not the tip commit for every part', () => {
    const run = (cmd, args) => (args[0] === 'rev-parse' ? { status: 0, stdout: 'true\n' } : { status: 0, stdout: `${HASH}\t2026-11-01` })
    expect(lastCommitFor(['a'], { run })).toEqual({ commit: null, date: null })
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
    expect(out[1]).toEqual({ id: 'osc', commit: HASH, date: '2026-11-01', history: [{ commit: HASH, date: '2026-11-01', title: '', pr: null }] })
  })
})

describe('part history from git, at pack time', () => {
  const H2 = 'b'.repeat(40)
  it('newest first, with the squash-merge PR number taken from the subject', () => {
    const calls = []
    const run = (cmd, args) => { calls.push([cmd, ...args]); return { status: 0, stdout: `${HASH}\t2026-11-20\tfeat(monitor): Parts tab (#1303)\n${H2}\t2026-11-12\tfix: no number here\n` } }
    expect(historyFor(['d'], { run, shallow: false, limit: 5 })).toEqual([
      { commit: HASH, date: '2026-11-20', title: 'feat(monitor): Parts tab (#1303)', pr: 1303 },
      { commit: H2, date: '2026-11-12', title: 'fix: no number here', pr: null }
    ])
    expect(calls[0]).toEqual(['git', 'log', '-5', '--format=%H%x09%cs%x09%s', '--', 'd'])
  })
  it('a "(#12)" in the middle of a subject is not the PR number', () => {
    const run = ran(0, `${HASH}\t2026-11-20\trevert (#12) and more\n`)
    expect(historyFor(['d'], { run, shallow: false })[0].pr).toBeNull()
  })
  it('shallow clone, no git or odd lines give [], never a guess', () => {
    expect(historyFor(['d'], { run: ran(0, `${HASH}\t2026-11-20\tx`), shallow: true })).toEqual([])
    expect(historyFor(['d'], { run: ran(128), shallow: false })).toEqual([])
    expect(historyFor(['d'], { run: ran(0, 'junk\tyesterday\tx\n'), shallow: false })).toEqual([])
    expect(historyFor(['d'], { run: () => null, shallow: false })).toEqual([])
  })
})
