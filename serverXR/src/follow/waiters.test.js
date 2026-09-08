// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { waitForChange, noteChange, waitingCount } = require('./waiters')

describe('holding a read open until a space changes', () => {
    it('comes back the moment a write lands, not when the timer runs out', async () => {
        const started = Date.now()
        const waiting = waitForChange('jam', 5000)
        // give the wait a tick to park
        await new Promise(resolve => setTimeout(resolve, 20))
        expect(waitingCount('jam')).toBe(1)
        noteChange('jam')
        expect(await waiting).toBe(true)
        expect(Date.now() - started).toBeLessThan(1000)
    })

    it('gives up on its own, so nothing is held forever', async () => {
        expect(await waitForChange('jam', 30)).toBe(false)
        expect(waitingCount('jam')).toBe(0)
    })

    it('wakes everyone waiting on that space and nobody else', async () => {
        const jam = [waitForChange('jam', 3000), waitForChange('jam', 3000)]
        const other = waitForChange('other-room', 60)
        await new Promise(resolve => setTimeout(resolve, 20))
        expect(noteChange('jam')).toBe(2)
        expect(await Promise.all(jam)).toEqual([true, true])
        expect(await other).toBe(false)
    })

    it('a write to a space nobody is following is free', () => {
        expect(noteChange('nobody-here')).toBe(0)
    })

    it('refuses to park on nonsense rather than leaking a timer', async () => {
        expect(await waitForChange('', 1000)).toBe(false)
        expect(await waitForChange('jam', 0)).toBe(false)
    })
})
