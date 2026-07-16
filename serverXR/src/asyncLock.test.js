import { describe, expect, it } from 'vitest'
import { createKeyedLock } from './asyncLock.js'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

describe('createKeyedLock', () => {
    it('serializes concurrent calls for the same key — the second never starts until the first resolves', async () => {
        const withLock = createKeyedLock()
        const order = []

        const first = withLock('a', async () => {
            order.push('first-start')
            await wait(20)
            order.push('first-end')
            return 'first'
        })
        const second = withLock('a', async () => {
            order.push('second-start')
            return 'second'
        })

        expect(await Promise.all([first, second])).toEqual(['first', 'second'])
        expect(order).toEqual(['first-start', 'first-end', 'second-start'])
    })

    it('does not serialize calls for different keys', async () => {
        const withLock = createKeyedLock()
        const order = []

        const a = withLock('a', async () => {
            order.push('a-start')
            await wait(20)
            order.push('a-end')
        })
        const b = withLock('b', async () => {
            order.push('b-start')
        })

        await Promise.all([a, b])
        // 'b' should run (and finish) while 'a' is still awaiting its timer —
        // if this were serialized, 'b-start' could only ever appear after 'a-end'.
        expect(order.indexOf('b-start')).toBeLessThan(order.indexOf('a-end'))
    })

    it('a thrown error in one call does not poison the lock for the next call on the same key', async () => {
        const withLock = createKeyedLock()
        await expect(withLock('a', async () => { throw new Error('boom') })).rejects.toThrow('boom')
        await expect(withLock('a', async () => 'ok')).resolves.toBe('ok')
    })
})
