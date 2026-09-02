import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    DESK_COMMANDS,
    DESK_STATUS,
    createThrottledSender,
    deskApiBase,
    deskHomeUrl,
    deskStatusText,
    readDeskScenes,
    readDeskSummary,
    resolveRigKind,
    resolveSceneId,
    sendDeskCommand,
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

// --- the desk lane ---------------------------------------------------------

describe('resolveRigKind', () => {
    it('starts a node with nothing set on this di.iiii\'s own desk', () => {
        expect(resolveRigKind({})).toBe('desk')
        expect(resolveRigKind(undefined)).toBe('desk')
    })
    it('reads a saved graph with no rig field but a host as vizzz — nothing already authored changes', () => {
        expect(resolveRigKind({ host: '192.168.1.40' })).toBe('vizzz')
    })
    it('obeys an explicit choice either way', () => {
        expect(resolveRigKind({ rig: 'vizzz' })).toBe('vizzz')
        expect(resolveRigKind({ rig: 'desk', host: '192.168.1.40' })).toBe('desk')
    })
    it('falls back rather than trusting a word it does not know', () => {
        expect(resolveRigKind({ rig: 'nonsense', host: 'rig' })).toBe('vizzz')
        expect(resolveRigKind({ rig: 'nonsense' })).toBe('desk')
    })
})

describe('deskApiBase / deskHomeUrl', () => {
    it('is app-level: /light/api against the page origin, no /serverXR and no bare /api', () => {
        expect(deskApiBase('http://localhost:5173', '')).toBe('http://localhost:5173/light/api')
        expect(deskHomeUrl('http://localhost:5173', '')).toBe('http://localhost:5173/light/')
    })
    it('moves with a base path, the way every other lane does', () => {
        expect(deskApiBase('https://example.org', '/di')).toBe('https://example.org/di/light/api')
        expect(deskHomeUrl('https://example.org', '/di')).toBe('https://example.org/di/light/')
    })
})

describe('DESK_COMMANDS', () => {
    it('speaks the desk\'s own bodies', () => {
        expect(DESK_COMMANDS.master(0.25)).toEqual({ path: '/master', body: { master: 64 } })
        expect(DESK_COMMANDS.level(5, 1)).toEqual({ path: '/raw', body: { universe: 0, channel: 5, value: 255 } })
        expect(DESK_COMMANDS.recall('s7')).toEqual({ path: '/scenes/recall', body: { id: 's7' } })
    })
    it('carries blackout as a STATE — the falling edge is a message too', () => {
        expect(DESK_COMMANDS.blackout(true)).toEqual({ path: '/master', body: { blackout: true } })
        expect(DESK_COMMANDS.blackout(false)).toEqual({ path: '/master', body: { blackout: false } })
    })
})

describe('readDeskSummary', () => {
    it('reads the desk when it answers', async () => {
        const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ fixtures: 21 }) })
        const result = await readDeskSummary('http://x/light/api', { fetchImpl })
        expect(fetchImpl).toHaveBeenCalledWith('http://x/light/api/summary', expect.anything())
        expect(result).toEqual({ ok: true, status: DESK_STATUS.ANSWERING, summary: { fixtures: 21 } })
    })
    it('names a hosted di.iiii by its 404 rather than calling it a network fault', async () => {
        const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404 })
        expect(await readDeskSummary('http://x/light/api', { fetchImpl })).toEqual({ ok: false, status: DESK_STATUS.ABSENT })
    })
    it('reads a 403 as the LAN rule', async () => {
        const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403 })
        expect(await readDeskSummary('http://x/light/api', { fetchImpl })).toEqual({ ok: false, status: DESK_STATUS.FORBIDDEN })
    })
    it('never throws at a silent network', async () => {
        const fetchImpl = vi.fn().mockRejectedValue(new TypeError('down'))
        expect(await readDeskSummary('http://x/light/api', { fetchImpl })).toEqual({ ok: false, status: DESK_STATUS.UNREACHABLE })
    })
})

describe('readDeskScenes', () => {
    it('reads the scene library', async () => {
        const fetchImpl = vi.fn().mockResolvedValue({
            ok: true, status: 200, json: async () => ({ scenes: [{ id: 's1', name: 'Red' }] }),
        })
        const result = await readDeskScenes('http://x/light/api', { fetchImpl })
        expect(fetchImpl).toHaveBeenCalledWith('http://x/light/api/scenes/summary', expect.anything())
        expect(result).toEqual({ ok: true, scenes: [{ id: 's1', name: 'Red' }] })
    })
    it('is empty, not broken, when the desk is not there', async () => {
        const fetchImpl = vi.fn().mockRejectedValue(new TypeError('down'))
        expect(await readDeskScenes('http://x/light/api', { fetchImpl })).toEqual({ ok: false, scenes: [] })
    })
})

describe('sendDeskCommand', () => {
    it('POSTs JSON and reads the answer — same origin, no CORS half-story', async () => {
        const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) })
        const result = await sendDeskCommand('http://x/light/api', DESK_COMMANDS.master(1), { fetchImpl })
        expect(fetchImpl).toHaveBeenCalledWith('http://x/light/api/master', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ master: 255 }),
        })
        expect(result.ok).toBe(true)
    })
    it('calls a recall that missed a failure, though the desk answered 200', async () => {
        const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: false }) })
        const result = await sendDeskCommand('http://x/light/api', DESK_COMMANDS.recall('nope'), { fetchImpl })
        expect(result.ok).toBe(false)
    })
    it('reports an unreachable desk instead of throwing into the graph', async () => {
        const fetchImpl = vi.fn().mockRejectedValue(new TypeError('down'))
        expect(await sendDeskCommand('http://x/light/api', DESK_COMMANDS.blackout(true), { fetchImpl })).toEqual({ ok: false, httpStatus: 0 })
    })
})

describe('resolveSceneId', () => {
    const scenes = [{ id: 's1', name: 'Red' }, { id: 's2', name: 'House lights' }]
    it('passes an id straight through', () => {
        expect(resolveSceneId(scenes, 's2')).toBe('s2')
    })
    it('turns the name written on the desk into its id, case and space forgiven', () => {
        expect(resolveSceneId(scenes, 'Red')).toBe('s1')
        expect(resolveSceneId(scenes, '  house lights ')).toBe('s2')
    })
    it('hands an unknown word to the desk rather than guessing', () => {
        expect(resolveSceneId(scenes, 'Blue')).toBe('Blue')
        expect(resolveSceneId([], 'Blue')).toBe('Blue')
    })
    it('is empty for an empty wire', () => {
        expect(resolveSceneId(scenes, '   ')).toBe('')
        expect(resolveSceneId(scenes, undefined)).toBe('')
    })
})

describe('deskStatusText', () => {
    it('says the useful sentence', () => {
        expect(deskStatusText({
            fixtures: 21, scenes: 588, activeSceneName: 'Red',
            fx: { enabled: true, mode: 'ring' }, chase: { enabled: false },
            output: { enabled: false },
        })).toBe('Desk: 21 fixtures, 588 scenes · Red · ring · output OFF')
    })
    it('says output on only when something is actually leaving the machine', () => {
        expect(deskStatusText({ fixtures: 1, scenes: 1, output: { enabled: true, connected: true } }))
            .toBe('Desk: 1 fixture, 1 scene · output on')
        expect(deskStatusText({ fixtures: 2, scenes: 0, output: { enabled: true, connected: false } }))
            .toBe('Desk: 2 fixtures, 0 scenes · output on, no driver')
    })
    it('shows a blackout, a fade and a running chase', () => {
        expect(deskStatusText({
            fixtures: 4, scenes: 9, blackout: true, activeScene: 's3', fading: true,
            chase: { enabled: true, index: 2, count: 6 }, output: { enabled: true, connected: true },
        })).toBe('Desk: 4 fixtures, 9 scenes · blackout · s3 (fading) · chase 3/6 · output on')
    })
})
