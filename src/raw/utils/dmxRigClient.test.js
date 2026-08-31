import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    createThrottledSender,
    isRigBlocked,
    readRigStatus,
    rigBaseUrl,
    sendRigCommand,
    toDmxByte,
} from './dmxRigClient.js'

describe('rigBaseUrl', () => {
    it('adds the scheme a bare host lacks', () => {
        expect(rigBaseUrl('192.168.1.40')).toBe('http://192.168.1.40')
    })
    it('keeps a scheme that is already there and drops trailing slashes', () => {
        expect(rigBaseUrl('http://vizzz.local/')).toBe('http://vizzz.local')
    })
    it('is empty for an empty host', () => {
        expect(rigBaseUrl('  ')).toBe('')
        expect(rigBaseUrl(undefined)).toBe('')
    })
})

describe('isRigBlocked', () => {
    it('names the mixed-content wall: https page, http rig', () => {
        expect(isRigBlocked('http://192.168.1.40', 'https:')).toBe(true)
        expect(isRigBlocked('http://192.168.1.40', 'http:')).toBe(false)
        expect(isRigBlocked('', 'https:')).toBe(false)
    })
})

describe('toDmxByte', () => {
    it('maps the wire convention 0..1 onto DMX bytes', () => {
        expect(toDmxByte(0)).toBe(0)
        expect(toDmxByte(1)).toBe(255)
        expect(toDmxByte(0.5)).toBe(128)
    })
    it('clamps instead of trusting the wire', () => {
        expect(toDmxByte(2)).toBe(255)
        expect(toDmxByte(-1)).toBe(0)
        expect(toDmxByte('not a number')).toBe(0)
    })
})

describe('readRigStatus', () => {
    it('reads name and universe from an answering rig', async () => {
        const fetchImpl = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ name: 'vizzz-a1', uni: 3 }),
        })
        const result = await readRigStatus('http://rig', { fetchImpl })
        expect(fetchImpl).toHaveBeenCalledWith('http://rig/status', expect.anything())
        expect(result).toEqual({ ok: true, name: 'vizzz-a1', universe: 3 })
    })
    it('reports a silent network as not ok, never as a throw', async () => {
        const fetchImpl = vi.fn().mockRejectedValue(new TypeError('unreachable'))
        await expect(readRigStatus('http://rig', { fetchImpl })).resolves.toEqual({ ok: false })
    })
})

describe('sendRigCommand', () => {
    it('fires no-cors and never awaits the verdict', () => {
        const fetchImpl = vi.fn().mockResolvedValue({})
        sendRigCommand('http://rig', '/blackout', { fetchImpl })
        expect(fetchImpl).toHaveBeenCalledWith('http://rig/blackout', { mode: 'no-cors' })
    })
    it('swallows a rejected fetch — the poll tells the reachability story', () => {
        const fetchImpl = vi.fn().mockRejectedValue(new TypeError('unreachable'))
        expect(() => sendRigCommand('http://rig', '/set?ch=1&v=0', { fetchImpl })).not.toThrow()
    })
})

describe('createThrottledSender', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('sends the first at once and coalesces the burst to the LATEST', () => {
        const send = vi.fn()
        const push = createThrottledSender(send, 100)
        push('/set?ch=1&v=10')
        push('/set?ch=1&v=20')
        push('/set?ch=1&v=30')
        expect(send).toHaveBeenCalledTimes(1)
        expect(send).toHaveBeenCalledWith('/set?ch=1&v=10')
        vi.advanceTimersByTime(100)
        expect(send).toHaveBeenCalledTimes(2)
        expect(send).toHaveBeenLastCalledWith('/set?ch=1&v=30')
    })

    it('cancel drops what is queued — nothing stale lands after a blackout', () => {
        const send = vi.fn()
        const push = createThrottledSender(send, 100)
        push('/master?v=255')
        push('/master?v=128')
        push.cancel()
        vi.advanceTimersByTime(200)
        expect(send).toHaveBeenCalledTimes(1)
    })
})
