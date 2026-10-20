// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createTestBarrier } = require('./testBarrier.js')

const req = (value) => ({ headers: value ? { 'x-test-barrier': value } : {} })

describe('testBarrier (test-only rendezvous)', () => {
    it('holds a request until its partner has arrived, then releases both', async () => {
        const barrier = createTestBarrier({ env: { NODE_ENV: 'test' } })
        const order = []
        const first = barrier.arrive(req('b:2')).then(() => order.push('first'))
        await Promise.resolve()
        await new Promise(resolve => setImmediate(resolve))
        expect(order).toEqual([])
        const second = barrier.arrive(req('b:2')).then(() => order.push('second'))
        await Promise.all([first, second])
        expect(order.sort()).toEqual(['first', 'second'])
    })
    it('is inert outside NODE_ENV=test, with no header, and for another name', async () => {
        await createTestBarrier({ env: { NODE_ENV: 'production' } }).arrive(req('b:2'))
        await createTestBarrier({ env: {} }).arrive(req('b:2'))
        await createTestBarrier({ env: { NODE_ENV: 'test' } }).arrive(req(null))
    })
    it('fails loudly, never hangs, when a partner never arrives', async () => {
        const barrier = createTestBarrier({ env: { NODE_ENV: 'test' }, timeoutMs: 30 })
        await expect(barrier.arrive(req('lonely:2'))).rejects.toThrow(/1 of 2 requests arrived/)
    })
    it('refuses a malformed header', async () => {
        const barrier = createTestBarrier({ env: { NODE_ENV: 'test' } })
        await expect(barrier.arrive(req('nope'))).rejects.toThrow(/bad x-test-barrier/)
    })
})
