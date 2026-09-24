import { describe, expect, it, vi } from 'vitest'
import { proposeLightTempo, readLightClock, setLightBlackout, setLightMaster } from './lightingLink.js'

// The show clock over the one wire (the Perform line, 2026-09-24).

const JSON_HEADERS = { get: (k) => (k.toLowerCase() === 'content-type' ? 'application/json' : null) }
const HTML_HEADERS = { get: (k) => (k.toLowerCase() === 'content-type' ? 'text/html' : null) }

describe('reading the Light desk clock', () => {
    it('returns the tempo, the phase anchor, the desk time and both local times', async () => {
        let t = 1000
        const fetchImpl = vi.fn(async () => {
            t += 20
            return { ok: true, status: 200, headers: JSON_HEADERS, json: async () => ({ up: true, bpm: 128, epoch: 555, beatsPerBar: 4, master: 200, blackout: false, show: 'lab', now: 9999 }) }
        })
        const reading = await readLightClock({ fetchImpl, now: () => t })
        expect(fetchImpl.mock.calls[0][0]).toMatch(/\/light\/api\/clock$/)
        expect(reading).toMatchObject({ up: true, bpm: 128, epoch: 555, master: 200, blackout: false, show: 'lab', serverNow: 9999, sentAt: 1000, receivedAt: 1020 })
    })

    it('a hosted tier’s own page, a 404 and a refused connection all read "not up", never throw', async () => {
        const html = await readLightClock({ fetchImpl: async () => ({ ok: true, status: 200, headers: HTML_HEADERS, json: async () => { throw new Error('<') } }) })
        expect(html.up).toBe(false)
        const missing = await readLightClock({ fetchImpl: async () => ({ ok: false, status: 404 }) })
        expect(missing.up).toBe(false)
        const refused = await readLightClock({ fetchImpl: async () => { throw new TypeError('Failed to fetch') } })
        expect(refused.up).toBe(false)
        const cold = await readLightClock({ fetchImpl: async () => ({ ok: true, status: 200, headers: JSON_HEADERS, json: async () => ({ up: false, now: 5 }) }) })
        expect(cold).toMatchObject({ up: false, serverNow: 5 })
    })
})

describe('talking back to the desk', () => {
    it('a tempo goes as whole bpm with the tap moved into desk time', async () => {
        const fetchImpl = vi.fn(async () => ({ ok: true }))
        await proposeLightTempo({ bpm: 127.6, epoch: 1000.4 }, { fetchImpl })
        expect(fetchImpl.mock.calls[0][0]).toMatch(/\/light\/api\/fx$/)
        expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ bpm: 128, epoch: 1000 })
    })

    it('blackout and master reach /api/master, master as 0..255', async () => {
        const fetchImpl = vi.fn(async () => ({ ok: true }))
        await setLightBlackout(true, { fetchImpl })
        await setLightMaster(0.5, { fetchImpl })
        expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ blackout: true })
        expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ master: 128 })
    })

    it('never rejects when nothing answers', async () => {
        await expect(setLightBlackout(true, { fetchImpl: async () => { throw new Error('down') } })).resolves.toBe(false)
    })
})
