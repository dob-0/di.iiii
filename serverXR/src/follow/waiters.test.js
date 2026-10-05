// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { waitForChange, noteChange, changeMark, waitingCount } = require('./waiters')

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

    // The lost wake (2026-10-04): a follower read the projects, the host
    // wrote, and only THEN did the follower park on the scene's log — nobody was
    // parked when the write landed, so the park sat out its whole wait.
    it('answers at once when the space changed after the reader was given its mark', async () => {
        const mark = changeMark('stage')
        noteChange('stage') // lands while nobody is parked
        const started = Date.now()
        expect(await waitForChange('stage', 5000, { mark })).toBe(true)
        expect(Date.now() - started).toBeLessThan(100)
        expect(waitingCount('stage')).toBe(0)
    })

    it('still holds when nothing changed since the mark', async () => {
        const mark = changeMark('stage')
        const started = Date.now()
        expect(await waitForChange('stage', 80, { mark })).toBe(false)
        expect(Date.now() - started).toBeGreaterThanOrEqual(70)
        expect(changeMark('stage')).toBe(mark)
    })

    it('a mark from another process never matches, so a restart answers once rather than holding', async () => {
        expect(await waitForChange('stage', 5000, { mark: 'another-process.0' })).toBe(true)
    })

    it('counts writes only for spaces a mark was handed out for, so made-up names cost nothing', async () => {
        noteChange('nobody-asked')
        noteChange('nobody-asked')
        // First mark: counting starts here, from nothing.
        expect(changeMark('nobody-asked').endsWith('.0')).toBe(true)
        noteChange('nobody-asked')
        expect(changeMark('nobody-asked').endsWith('.1')).toBe(true)
    })

    it('refuses to park on nonsense rather than leaking a timer', async () => {
        expect(await waitForChange('', 1000)).toBe(false)
        expect(await waitForChange('jam', 0)).toBe(false)
    })
})
