// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { MAX_STROBE_HZ } from './strobeCap.js'
import { decodeDmx, encodeDmx } from './dmxDecode.js'
import { ASSUMED_PROFILES } from './assumedProfiles.js'

// Cap review A1 (2026-09-30): the DMX value written for a capped rate must PLAY at <= the cap,
// and the desk's own strobe effect must never flash faster than the same cap.
const require = createRequire(import.meta.url)

const channelsOf = Object.values(ASSUMED_PROFILES).flatMap((e) => e.modes.map((m) => m.channels))
const strobing = channelsOf.filter((chs) => chs.some((c) => c.cap?.shutter?.some((r) => r.strobe) || c.cap?.rate))

describe('a capped strobe rate is written so it plays no faster than the cap', () => {
    it('covers at least one table', () => expect(strobing.length).toBeGreaterThan(0))
    it.each([3, 2.99, 2.5, 1, 0.5])('%s Hz round-trips at or below itself, in every assumed table', (hz) => {
        for (const chs of strobing) {
            const cell = encodeDmx(chs, { level: 1, strobeHz: hz })
            const back = decodeDmx(chs, chs.map((c) => cell[c.role] ?? c.default ?? 0))
            expect(back.strobeHz).toBeLessThanOrEqual(Math.min(hz, MAX_STROBE_HZ) + 1e-9)
        }
    })
})

describe('the desk strobe effect', () => {
    const { fxLevel, FRAME_MS } = require('../../serverXR/src/lighting/fx.js')
    it.each([20, 60, 120, 300])('flashes at most MAX_STROBE_HZ times a second at %s bpm', (bpm) => {
        let rises = 0
        let prev = 0
        for (let t = 0; t < 10000; t += FRAME_MS) {
            const v = fxLevel({ enabled: true, mode: 'strobe', bpm }, {}, 0, 1, t)
            if (v > 127 && prev <= 127) rises++
            prev = v
        }
        expect(rises).toBeGreaterThan(0)
        expect(rises / 10).toBeLessThanOrEqual(MAX_STROBE_HZ)
    })
})
