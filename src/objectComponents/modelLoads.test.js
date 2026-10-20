import { describe, expect, it } from 'vitest'
import { getModelLoadSnapshot, modelsLoading, reportModelLoad, subscribeModelLoads } from './modelLoads.js'

describe('model loads: counted and watchable', () => {
    it('a wave counts its models, done and loading, and starts over once idle', () => {
        let calls = 0
        const off = subscribeModelLoads(() => { calls += 1 })
        const a = reportModelLoad(); const b = reportModelLoad(); const c = reportModelLoad()
        expect(getModelLoadSnapshot()).toEqual({ loading: 3, done: 0, total: 3 })
        a(); a()
        expect(getModelLoadSnapshot()).toEqual({ loading: 2, done: 1, total: 3 })
        b(); c()
        expect(modelsLoading()).toBe(false)
        expect(getModelLoadSnapshot()).toEqual({ loading: 0, done: 3, total: 3 })
        const d = reportModelLoad()
        expect(getModelLoadSnapshot()).toEqual({ loading: 1, done: 0, total: 1 })
        d(); off()
        expect(calls).toBe(8) // 3 starts, 3 ends, 1 start, 1 end
    })
    it('the snapshot is the same object until the count changes', () => {
        expect(getModelLoadSnapshot()).toBe(getModelLoadSnapshot())
    })
})
