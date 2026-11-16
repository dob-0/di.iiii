import { describe, expect, it } from 'vitest'
import { flowPulses, flowRates, nodeOfKey, perMinute, reportEdge } from './monitorFlow.js'

const snap = (reports) => ({ reports })
describe('nodeOfKey', () => {
    it('points a feed key at its map node', () => {
        expect(nodeOfKey('tier:dev:up')).toBe('tier:dev')
        expect(nodeOfKey('tier:local:aylmo:commit')).toBe('tier:local:aylmo')
        expect(nodeOfKey('machine:aylmo:online')).toBe('machine:aylmo')
        expect(nodeOfKey('report:aylmo')).toBe('machine:aylmo')
        expect(nodeOfKey('agent:aylmo/abcdef0123:status')).toBe('agent:aylmo:abcdef01')
        expect(nodeOfKey('pr:5:new')).toBeNull()
    })
})
describe('flowPulses', () => {
    it('sends one pulse along the edge of each source whose report moved', () => {
        const prev = snap([{ host: 'a', reportedAt: 't1' }, { host: 'b', reportedAt: 't1' }])
        const next = snap([{ host: 'a', reportedAt: 't2' }, { host: 'b', reportedAt: 't1' }])
        expect(flowPulses(prev, next)).toEqual([{ ...reportEdge('a'), tone: 'accent', kind: 'report', host: 'a' }])
    })
    it('pulses the node a change names, with its tone, and ignores keys with no node', () => {
        const events = [{ key: 'tier:dev:up', tone: 'danger', text: 'dev stopped answering' }, { key: 'pr:1:new', tone: 'accent', text: 'PR' }]
        expect(flowPulses(snap([]), snap([]), events)).toEqual([{ from: 'tier:dev', to: 'tier:dev', tone: 'danger', kind: 'change', text: 'dev stopped answering' }])
    })
    it('gives nothing for a first snapshot, or a quiet one', () => {
        expect(flowPulses(null, snap([]))).toEqual([])
        expect(flowPulses(snap([{ host: 'a', reportedAt: 't1' }]), snap([{ host: 'a', reportedAt: 't1' }]))).toEqual([])
    })
})
describe('flowRates', () => {
    const now = 1_000_000
    const log = [60, 50, 40, 30, 20, 10].map((s) => ({ kind: 'report', host: 'a', t: now - s * 1000 }))
    it('counts reports per minute over the last 5 minutes', () => {
        expect(flowRates(log, [{ host: 'a', reportedAt: new Date(now).toISOString() }], now).a).toMatchObject({ perMin: 1.2, silent: false, lastAt: now - 10000 })
    })
    it('marks a source silent when it is quiet far longer than its normal gap, or flagged stale', () => {
        expect(flowRates(log, [], now + 200_000).a.silent).toBe(true)
        expect(flowRates([], [{ host: 'z', reportedAt: new Date(now).toISOString(), stale: true }], now).z.silent).toBe(true)
    })
})
describe('perMinute', () => {
    it('buckets events per minute, oldest first', () => {
        const now = 10 * 60000
        expect(perMinute([{ t: now - 1000 }, { t: now - 2000 }, { t: now - 61000 }], now, 3)).toEqual([0, 1, 2])
    })
})
