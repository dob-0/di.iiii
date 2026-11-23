import { describe, expect, it } from 'vitest'
import { buildMachines, buildPartVersions, filterVersions, shortCommit, worksTone } from './monitorVersions.js'

const A = 'a'.repeat(40)
const B = 'b'.repeat(40)
const C = 'c'.repeat(40)

describe('machines against dev', () => {
  it('says each machine commit and how it stands, and "commit unknown" stays unknown', () => {
    const snap = { tiers: { rows: [
      { id: 'dev', commit: A, builtAt: '2026-11-20T10:00:00Z', behindDev: 0, status: 200 },
      { id: 'local:aylmo', commit: B, builtAt: null, behindDev: 3, status: 200 },
      { id: 'local:old', commit: null, status: 200 }
    ] } }
    const [dev, aylmo, old] = buildMachines(snap)
    expect(dev).toMatchObject({ name: 'dev', short: 'aaaaaaaaa', built: '2026-11-20', note: 'the reference' })
    expect(aylmo).toMatchObject({ name: 'local · aylmo', behind: 3, tone: 'warning', note: '3 behind dev', built: null })
    expect(old).toMatchObject({ short: null, note: 'commit unknown' })
    expect(buildMachines(null)).toEqual([])
  })
})

describe('part versions', () => {
  const hist = [
    { commit: A, date: '2026-11-20', title: 'new (#3)', pr: 3 },
    { commit: B, date: '2026-11-12', title: 'proven one (#2)', pr: 2 },
    { commit: C, date: '2026-11-01', title: 'old', pr: null }
  ]
  it('marks the running version and the last one seen working, newest first as given', () => {
    const [p] = buildPartVersions({ parts: { rows: [{ id: 'light', name: 'Light', state: 'off', works: 'not working', commit: A, date: '2026-11-20', history: hist, proven: { commit: B, date: '2026-11-12', at: 1 } }] } })
    expect(p.history.map((h) => [h.short, h.running, h.proven])).toEqual([['aaaaaaaaa', true, false], ['bbbbbbbbb', false, true], ['ccccccccc', false, false]])
    expect(p).toMatchObject({ works: 'not working', unproven: true, provenOutside: false })
  })
  it('a proven version older than the list is still named; a part never seen working says so', () => {
    const [p, q] = buildPartVersions({ parts: { rows: [
      { id: 'a', name: 'A', works: 'working', commit: A, history: hist.slice(0, 1), proven: { commit: C, date: null, at: 1 } },
      { id: 'b', name: 'B', works: 'unknown', commit: null, history: [], proven: null }
    ] } })
    expect(p.provenOutside).toBe(true)
    expect(q).toMatchObject({ short: null, proven: null, unproven: false, history: [], works: 'unknown' })
  })
  it('a running version equal to the proven one is not flagged unproven', () => {
    const [p] = buildPartVersions({ parts: { rows: [{ id: 'a', name: 'A', works: 'working', commit: A, history: hist, proven: { commit: A, at: 1 } }] } })
    expect(p.unproven).toBe(false)
  })
  it('old snapshots without history or works read as unknown, not as a crash', () => {
    const [p] = buildPartVersions({ parts: { rows: [{ id: 'a', name: 'A', commit: A, date: '2026-11-01' }] } })
    expect(p).toMatchObject({ works: 'unknown', history: [] })
  })
})

describe('helpers', () => {
  it('shortCommit only shortens real hashes', () => {
    expect(shortCommit(A)).toBe('aaaaaaaaa')
    expect(shortCommit('zz')).toBeNull()
    expect(shortCommit(null)).toBeNull()
  })
  it('worksTone: only working is green, only not working is red', () => {
    expect([worksTone('working'), worksTone('not working'), worksTone('idle'), worksTone('unknown'), worksTone('x')]).toEqual(['success', 'danger', 'muted', 'muted', 'muted'])
  })
  it('filter matches by text, empty query keeps all', () => {
    expect(filterVersions([{ n: 'Light' }, { n: 'Laser' }], 'las', (i) => i.n)).toEqual([{ n: 'Laser' }])
    expect(filterVersions([{ n: 'a' }], '', (i) => i.n)).toHaveLength(1)
  })
})
