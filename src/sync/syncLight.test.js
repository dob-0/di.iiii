import { describe, expect, it } from 'vitest'
import {
    FOLLOWER_STALE_MS, STALE_MS, clashesToday, displayName, formatAgo, formatLatency, formatSince, syncLight, syncPanel
} from './syncLight.js'

const NOW = 1_800_000_000_000
const live = (over = {}, files = {}) => ({
    spaceId: 'moxir',
    follows: {
        host: { name: 'ponyo' }, status: 'following', hostAnswering: true, hostRefused: false, lastAnswerAt: NOW - 1000,
        latencyMs: 120, lastEditAt: NOW - 4000, clashes: 0, clashTimes: [], lastError: null,
        files: { pending: 0, failed: 0, carried: 5, bytesPending: 0, ...files }, ...over
    },
    followers: []
})

describe('the words of the light (the owner-approved sketch)', () => {
    it('SYNCED · PONYO · 0.1 S when the host answers and nothing is waiting', () => {
        expect(syncLight(live(), NOW)).toEqual({ tone: 'ok', state: 'synced', text: 'SYNCED · PONYO · 0.1 S' })
    })

    it('PONYO NOT ANSWERING · 2 MIN when the host went silent two minutes ago', () => {
        const status = live({ hostAnswering: false, status: 'waiting', lastAnswerAt: NOW - 120_000 })
        expect(syncLight(status, NOW)).toEqual({ tone: 'warn', state: 'silent', text: 'PONYO NOT ANSWERING · 2 MIN' })
    })

    it('counts seconds, minutes, hours and days in the light’s own units', () => {
        expect(formatSince(42_000)).toBe('42 S')
        expect(formatSince(120_000)).toBe('2 MIN')
        expect(formatSince(3 * 3600_000)).toBe('3 H')
        expect(formatSince(2 * 86_400_000)).toBe('2 D')
        expect(formatAgo(4000)).toBe('4 s ago')
        expect(formatAgo(120_000)).toBe('2 min ago')
    })

    it('says how fast without rounding a very fast answer up into a claim', () => {
        expect(formatLatency(120)).toBe('0.1 S')
        expect(formatLatency(1234)).toBe('1.2 S')
        expect(formatLatency(12_345)).toBe('12 S')
        expect(formatLatency(12)).toBe('<0.1 S')
        expect(formatLatency(null)).toBeNull()
        expect(syncLight(live({ latencyMs: null }), NOW).text).toBe('SYNCED · PONYO')
    })

    it('shows no light at all when this install neither follows nor is followed', () => {
        expect(syncLight(null, NOW)).toBeNull()
        expect(syncLight({ follows: null, followers: [] }, NOW)).toBeNull()
        expect(syncLight({ spaceId: 'x' }, NOW)).toBeNull()
    })

    it('names an unnamed machine and cuts a long name', () => {
        expect(displayName('')).toBe('A MACHINE')
        expect(displayName('x'.repeat(60)).length).toBe(24)
        expect(syncLight(live({ host: { name: null } }), NOW).text).toBe('SYNCED · A MACHINE · 0.1 S')
    })
})

describe('"synced" is said in one case only — never while files are still coming', () => {
    it('files still coming: SYNCING, with the count, in both singular and plural', () => {
        expect(syncLight(live({}, { pending: 1 }), NOW).text).toBe('SYNCING · PONYO · 1 FILE COMING')
        expect(syncLight(live({}, { pending: 3 }), NOW).text).toBe('SYNCING · PONYO · 3 FILES COMING')
    })

    it('files that could not come are not "synced" either', () => {
        expect(syncLight(live({}, { failed: 2 }), NOW).text).toBe('2 FILES FAILED · PONYO')
    })

    it('catching up on edits, a pending clash notice, a refused key and a not-yet-answered start are not "synced"', () => {
        expect(syncLight(live({ status: 'catching up' }), NOW).state).toBe('catching-up')
        expect(syncLight(live({ lastError: 'one side replaced a whole scene' }), NOW).state).toBe('attention')
        expect(syncLight(live({ hostRefused: true }), NOW).text).toBe('PONYO REFUSED THIS MACHINE')
        expect(syncLight(live({ status: 'starting', hostAnswering: null, lastAnswerAt: null }), NOW).text).toBe('CONNECTING · PONYO')
    })

    it('a host that answered once but has been quiet past the net is NOT ANSWERING even if it never said so', () => {
        const status = live({ lastAnswerAt: NOW - STALE_MS - 1000 })
        expect(syncLight(status, NOW).state).toBe('silent')
    })

    it('over every combination of the inputs, SYNCED appears only when everything is clear', () => {
        let synced = 0
        let checked = 0
        for (const status of ['starting', 'following', 'catching up', 'waiting']) {
            for (const hostAnswering of [null, true, false]) {
                for (const hostRefused of [false, true]) {
                    for (const lastAnswerAgo of [null, 1000, STALE_MS + 1]) {
                        for (const pending of [0, 2]) {
                            for (const failed of [0, 1]) {
                                for (const lastError of [null, 'x']) {
                                    for (const latencyMs of [null, 90]) {
                                        const view = live({
                                            status, hostAnswering, hostRefused, latencyMs, lastError,
                                            lastAnswerAt: lastAnswerAgo === null ? null : NOW - lastAnswerAgo
                                        }, { pending, failed })
                                        const light = syncLight(view, NOW)
                                        checked += 1
                                        const allClear = status === 'following' && hostAnswering === true && !hostRefused
                                            && lastAnswerAgo !== STALE_MS + 1 && pending === 0 && failed === 0 && !lastError
                                        expect(/SYNCED/.test(light.text), JSON.stringify([status, hostAnswering, hostRefused, lastAnswerAgo, pending, failed, lastError])).toBe(allClear)
                                        if (allClear) synced += 1
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        expect(checked).toBe(4 * 3 * 2 * 3 * 2 * 2 * 2 * 2)
        expect(synced).toBeGreaterThan(0)
    })
})

describe('the host’s light — it cannot know about files or clashes, so it never says "synced"', () => {
    const hosted = (followers) => ({ follows: null, followers })

    it('SHARED · NAME · LIVE while a follower calls in', () => {
        expect(syncLight(hosted([{ machineId: 'm', name: 'asuz', seenAt: NOW - 3000 }]), NOW)).toEqual({ tone: 'ok', state: 'shared', text: 'SHARED · ASUZ · LIVE' })
        expect(syncLight(hosted([{ machineId: 'a', name: 'asuz', seenAt: NOW }, { machineId: 'b', name: 'win', seenAt: NOW }]), NOW).text).toBe('SHARED · 2 MACHINES · LIVE')
    })

    it('NAME NOT ANSWERING · 2 MIN once a follower has not called in for longer than it ever waits', () => {
        const light = syncLight(hosted([{ machineId: 'm', name: 'asuz', seenAt: NOW - 120_000 }]), NOW)
        expect(light).toEqual({ tone: 'warn', state: 'silent', text: 'ASUZ NOT ANSWERING · 2 MIN' })
        expect(syncLight(hosted([{ machineId: 'm', name: 'asuz', seenAt: NOW - FOLLOWER_STALE_MS + 1 }]), NOW).tone).toBe('ok')
        expect(syncLight(hosted([
            { machineId: 'a', name: 'asuz', seenAt: NOW - 90_000 }, { machineId: 'b', name: 'win', seenAt: NOW - 60_000 }
        ]), NOW).text).toBe('2 MACHINES NOT ANSWERING')
    })

    it('never contains "synced"', () => {
        for (const seenAgo of [0, 5000, 25_000, 300_000]) {
            expect(syncLight(hosted([{ machineId: 'm', name: 'asuz', seenAt: NOW - seenAgo }]), NOW).text).not.toMatch(/SYNCED/)
        }
    })

    it('a machine that both follows and is followed shows the follower’s light', () => {
        const both = { ...live(), followers: [{ machineId: 'm', name: 'asuz', seenAt: NOW }] }
        expect(syncLight(both, NOW).text).toBe('SYNCED · PONYO · 0.1 S')
    })
})

describe('the panel under the light (the sketch’s rows and words)', () => {
    it('lists the host, files still coming and clashes today, with the sketch’s own sentences', () => {
        const day = new Date(NOW); day.setHours(0, 0, 0, 0)
        const status = live({ clashTimes: [day.getTime() - 5000, NOW - 60_000] })
        const panel = syncPanel(status, NOW)
        expect(panel.title).toBe('THIS SPACE IS ALSO ON')
        expect(panel.rows).toEqual([
            ['ponyo — host', 'live · last edit 4 s ago'],
            ['files still coming', '0'],
            ['clashes today', "1 — host's version kept"]
        ])
        expect(panel.canStopFollowing).toBe(true)
        expect(panel.note).toBeNull()
    })

    it('counts a clash on the viewer’s calendar day only, and not one in the future', () => {
        const day = new Date(NOW); day.setHours(0, 0, 0, 0)
        expect(clashesToday([day.getTime() - 1, day.getTime(), NOW, NOW + 1000], NOW)).toBe(2)
        expect(clashesToday(undefined, NOW)).toBe(0)
    })

    it('when the host is silent it says what happens to edits, in the sketch’s sentence', () => {
        const panel = syncPanel(live({ hostAnswering: false, status: 'waiting', lastAnswerAt: NOW - 120_000 }), NOW)
        expect(panel.rows[0]).toEqual(['ponyo — host', 'not answering · 2 min'])
        expect(panel.note).toBe('Edits made here wait and cross when ponyo is back. Nothing is lost; nothing needs doing.')
    })

    it('shows the files that are coming, and the ones that failed', () => {
        expect(syncPanel(live({}, { pending: 3, failed: 1 }), NOW).rows[1]).toEqual(['files still coming', '3 · 1 failed'])
    })

    it('on the host: who follows, live or not, and no "stop following" (it follows nothing)', () => {
        const panel = syncPanel({ follows: null, followers: [{ machineId: 'm', name: 'asuz', seenAt: NOW - 3000 }, { machineId: 'n', name: 'win', seenAt: NOW - 300_000 }] }, NOW)
        expect(panel.rows).toEqual([
            ['asuz — follows this space', 'live · seen 3 s ago'],
            ['win — follows this space', 'not answering · seen 5 min ago']
        ])
        expect(panel.canStopFollowing).toBe(false)
    })
})
